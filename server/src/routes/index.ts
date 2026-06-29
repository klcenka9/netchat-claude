import { Express } from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import friendsRoutes, { blocksRouter } from './friends.routes';
import serversRoutes from './servers.routes';
import channelsRoutes from './channels.routes';
import threadsRoutes from './threads.routes';
import messagesRoutes from './messages.routes';
import searchRoutes from './search.routes';
import rolesRoutes from './roles.routes';
import emojisRoutes from './emojis.routes';
import webhooksRoutes from './webhooks.routes';
import auditLogRoutes from './auditLog.routes';
import dmsRoutes from './dms.routes';
import uploadsRoutes from './uploads.routes';
import voiceRoutes from './voice.routes';
import notificationsRoutes from './notifications.routes';

export function registerRoutes(app: Express): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/friends', friendsRoutes);
  app.use('/api/blocks', blocksRouter);
  app.use('/api', serversRoutes);
  app.use('/api', channelsRoutes);
  app.use('/api', threadsRoutes);
  app.use('/api', messagesRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', rolesRoutes);
  app.use('/api', emojisRoutes);
  app.use('/api', webhooksRoutes);
  app.use('/api', auditLogRoutes);
  app.use('/api/dms', dmsRoutes);
  app.use('/api', uploadsRoutes);
  app.use('/api/voice', voiceRoutes);
  app.use('/api', notificationsRoutes);
}
