import { Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import {
  memberHasServerPermission,
  memberHasChannelPermission,
} from '../utils/permissionResolver';

// Requires a server-wide permission. serverIdParam names the route param holding the server id.
export function requireServerPermission(perm: number, serverIdParam = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const serverId = req.params[serverIdParam];
    if (!memberHasServerPermission(serverId, req.userId!, perm)) {
      res.status(403).json({ error: 'Missing permission' });
      return;
    }
    next();
  };
}

// Requires server membership only.
export function requireServerMember(serverIdParam = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const serverId = req.params[serverIdParam];
    const member = db
      .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
      .get(serverId, req.userId!);
    if (!member) {
      res.status(403).json({ error: 'Not a member' });
      return;
    }
    next();
  };
}

// Requires a channel-scoped permission (applies overwrites).
export function requireChannelPermission(perm: number, channelIdParam = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const channelId = req.params[channelIdParam];
    if (!memberHasChannelPermission(channelId, req.userId!, perm)) {
      res.status(403).json({ error: 'Missing permission' });
      return;
    }
    next();
  };
}
