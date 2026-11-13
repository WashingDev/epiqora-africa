import {
  createSign,
  generateKeyPairSync,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';

import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { JwtAuthGuard } from '../guards/jwt-auth/jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

const ISSUER = 'http://epiqora-test.local/realms/epiqora';
const AUDIENCE = 'epiqora-api';
const KEY_ID = 'epiqora-test-signing-key';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const wrongKeyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KEY_ID,
  use: 'sig',
  alg: 'RS256',
};

@Controller('auth-test')
class JwtTestController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: Request & { user?: unknown }) {
    return req.user;
  }
}

describe('JwtStrategy real JWT verification', () => {
  let app: INestApplication;
  let jwksServer: Server;
  let jwksUri: string;

  const config = {
    KEYCLOAK_ISSUER: ISSUER,
    KEYCLOAK_JWKS_URI: '',
    KEYCLOAK_AUDIENCE: AUDIENCE,
  };

  function createToken(
    overrides: Record<string, unknown> = {},
    signingKey = privateKey,
  ): string {
    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: KEY_ID,
    };

    const payload = {
      sub: 'test-user-123',
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now,
      exp: now + 300,
      email: 'test@example.invalid',
      preferred_username: 'test-user',
      name: 'Test User',
      realm_access: {
        roles: ['SURVEILLANCE_OFFICER'],
      },
      ...overrides,
    };

    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    const unsignedToken = `${encode(header)}.${encode(payload)}`;

    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();

    const signature = signer.sign(signingKey).toString('base64url');

    return `${unsignedToken}.${signature}`;
  }

  beforeAll(async () => {
    jwksServer = createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });

      res.end(JSON.stringify({
        keys: [publicJwk],
      }));
    });

    await new Promise<void>((resolve, reject) => {
      jwksServer.once('error', reject);
      jwksServer.listen(0, '127.0.0.1', resolve);
    });

    const address = jwksServer.address() as AddressInfo;
    jwksUri = `http://127.0.0.1:${address.port}/jwks`;

    config.KEYCLOAK_JWKS_URI = jwksUri;

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({
          defaultStrategy: 'jwt',
        }),
      ],
      controllers: [JwtTestController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const value = config[key as keyof typeof config];

              if (!value) {
                throw new Error(`Missing test configuration: ${key}`);
              }

              return value;
            },
          },
        },
        JwtStrategy,
        JwtAuthGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();

    if (jwksServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        jwksServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('accepts a valid RS256 token', async () => {
    const token = createToken();

    const response = await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'test-user-123',
      email: 'test@example.invalid',
      username: 'test-user',
      roles: ['SURVEILLANCE_OFFICER'],
    });
  });

  it('rejects a token with an invalid signature', async () => {
    const token = createToken({}, wrongKeyPair.privateKey);

    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a token with an incorrect issuer', async () => {
    const token = createToken({
      iss: 'http://wrong-issuer.local',
    });

    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a token with an incorrect audience', async () => {
    const token = createToken({
      aud: 'another-api',
    });

    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an expired token', async () => {
    const token = createToken({
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a request without a bearer token', async () => {
    await request(app.getHttpServer())
      .get('/auth-test/me')
      .expect(401);
  });
});
