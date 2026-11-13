import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { JwtAuthGuard } from './../src/modules/auth/guards/jwt-auth/jwt-auth.guard';
import { OrganizationMembershipsService } from './../src/modules/organization-memberships/organization-memberships.service';

describe('AppController and OrganizationsController (e2e)', () => {
  let app: INestApplication<App>;

  const testToken = 'e2e-test-token';
  const organizationId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: { id: string };
          }>();

          if (request.headers.authorization !== `Bearer ${testToken}`) {
            throw new UnauthorizedException();
          }

          request.user = { id: 'e2e-user-1' };

          return true;
        },
      })
      .overrideProvider(OrganizationMembershipsService)
      .useValue({
        findActiveMembership: async () => null,
      })
      .compile();

    app = moduleFixture.createNestApplication();

    configureApp(app);

    await app.init();
  });

  it('GET /api/v1 should return Hello World', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('should reject unauthenticated requests', () => {
    return request(app.getHttpServer())
      .get('/api/v1/organizations/memberships')
      .expect(401);
  });

  it('should reject an authenticated request without organization context', () => {
    return request(app.getHttpServer())
      .get('/api/v1/organizations/memberships')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(400);
  });

  it('should reject a user without an active organization membership', () => {
    return request(app.getHttpServer())
      .get('/api/v1/organizations/memberships')
      .set('Authorization', `Bearer ${testToken}`)
      .set('X-Organization-Id', organizationId)
      .expect(403);
  });

  afterEach(async () => {
    await app.close();
  });
});
