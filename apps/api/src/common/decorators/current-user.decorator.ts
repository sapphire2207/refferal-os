import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthTokenPayload } from '@heals/types';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthTokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthTokenPayload;

    return data ? user?.[data] : user;
  },
);
