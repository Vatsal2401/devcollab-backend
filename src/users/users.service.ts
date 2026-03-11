import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UserEntity, UserRole } from './entities/user.entity';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(): Promise<Omit<UserEntity, 'passwordHash'>[]> {
    const users = await this.usersRepo.find({
      order: { createdAt: 'ASC' },
    });
    return users.map(({ passwordHash, ...rest }) => rest as any);
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async invite(
    dto: InviteUserDto,
    invitedById: string,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(`Email ${dto.email} is already registered`);
    }

    const existingUsername = await this.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException(`Username ${dto.username} is already taken`);
    }

    // Generate a random temporary password
    const tempPassword = uuidv4().replace(/-/g, '').substring(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = this.usersRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role,
      isActive: false, // Inactive until activated by TL
      invitedBy: invitedById,
    });

    const saved = await this.usersRepo.save(user);

    // Send invitation email
    await this.notificationsService.sendEmail({
      to: dto.email,
      subject: 'Welcome to DevCollab — Your Invitation',
      html: `
        <h2>You have been invited to DevCollab</h2>
        <p>Your account has been created with the following details:</p>
        <ul>
          <li><strong>Username:</strong> ${dto.username}</li>
          <li><strong>Temporary Password:</strong> ${tempPassword}</li>
          <li><strong>Role:</strong> ${dto.role}</li>
        </ul>
        <p>Please log in and change your password immediately. Your account must be activated by a Tech Lead before you can access the platform.</p>
      `,
    });

    const { passwordHash: _, ...result } = saved;
    return result as any;
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    requestingUser: UserEntity,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    if (requestingUser.role !== UserRole.TECHLEAD) {
      throw new ForbiddenException('Only Tech Leads can change user roles');
    }

    const user = await this.findById(id);
    const oldRole = user.role;
    user.role = dto.role;
    const saved = await this.usersRepo.save(user);

    await this.notificationsService.sendSlack({
      channel: process.env.SLACK_CHANNEL_PLANS,
      text: `User *${user.username}* role changed from *${oldRole}* to *${dto.role}* by *${requestingUser.username}*`,
    });

    const { passwordHash: _, ...result } = saved;
    return result as any;
  }

  async deactivate(
    id: string,
    requestingUser: UserEntity,
  ): Promise<{ message: string }> {
    if (requestingUser.role !== UserRole.TECHLEAD) {
      throw new ForbiddenException('Only Tech Leads can deactivate users');
    }

    if (id === requestingUser.id) {
      throw new ForbiddenException('You cannot deactivate yourself');
    }

    const user = await this.findById(id);
    user.isActive = false;
    await this.usersRepo.save(user);

    return { message: `User ${user.username} has been deactivated` };
  }

  async activate(
    id: string,
    requestingUser: UserEntity,
  ): Promise<{ message: string }> {
    if (requestingUser.role !== UserRole.TECHLEAD) {
      throw new ForbiddenException('Only Tech Leads can activate users');
    }

    const user = await this.findById(id);
    user.isActive = true;
    await this.usersRepo.save(user);

    // Notify the activated user
    await this.notificationsService.sendEmail({
      to: user.email,
      subject: 'DevCollab — Your Account Has Been Activated',
      html: `
        <h2>Account Activated</h2>
        <p>Hi ${user.username}, your DevCollab account has been activated by the Tech Lead.</p>
        <p>You can now log in and start collaborating!</p>
      `,
    });

    return { message: `User ${user.username} has been activated` };
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.usersRepo.update(id, { lastSeen: new Date() });
  }
}
