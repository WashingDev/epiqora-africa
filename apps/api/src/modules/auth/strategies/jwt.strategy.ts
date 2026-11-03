import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwksRsa from 'jwks-rsa';

export interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  iss: string;
  aud?: string | string[];
  exp: number;
  iat: number;
  realm_access?: {
    roles: string[];
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const issuer = configService.getOrThrow<string>('KEYCLOAK_ISSUER');
    const jwksUri = configService.getOrThrow<string>('KEYCLOAK_JWKS_URI');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }),
      issuer,
      audience: configService.getOrThrow<string>('KEYCLOAK_AUDIENCE'),
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      name: payload.name,
      roles: payload.realm_access?.roles ?? [],
    };
  }
}