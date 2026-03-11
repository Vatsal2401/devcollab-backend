import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(
    username: string,
    password: string,
  ): Promise<{ access_token: string; user: Omit<UserEntity, 'passwordHash'> }> {
    const user = await this.usersRepo.findOne({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is not yet activated. Contact your Tech Lead.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastSeen(user.id);

    const payload = { sub: user.id, username: user.username, role: user.role };
    const access_token = this.jwtService.sign(payload);

    const { passwordHash, ...userWithoutPassword } = user;
    return { access_token, user: userWithoutPassword as any };
  }

  getMe(user: UserEntity): Omit<UserEntity, 'passwordHash'> {
    const { passwordHash, ...rest } = user;
    return rest as any;
  }
}
