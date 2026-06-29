import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { requireServerMember, requireServerPermission } from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { getMemberContext } from '../utils/permissionResolver';
import {
  canGrantPermissions,
  canGrantAddedPermissions,
  canActOnRolePosition,
  canManageRoles,
} from '../utils/escalation';
import {
  listRoles,
  createRole,
  getRole,
  updateRole,
  deleteRole,
  assignRole,
  unassignRole,
} from '../models/role.model';
import { isMember } from '../models/server.model';
import { logAudit } from '../models/auditLog.model';
import { emitToServer } from '../utils/realtime';

const router = Router();

router.get('/servers/:id/roles', requireAuth, requireServerMember(), (req, res) => {
  res.json(listRoles(req.params.id));
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  permissions: z.number().int().nonnegative().optional(),
  hoist: z.boolean().optional(),
});

router.post(
  '/servers/:id/roles',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_ROLES),
  validateBody(createRoleSchema),
  (req, res) => {
    const ctx = getMemberContext(req.params.id, req.userId!);
    const wanted = req.body.permissions ?? 0;
    // Escalation guard #1: can't grant permissions you don't have yourself.
    if (!canGrantPermissions(ctx, wanted)) {
      return res.status(403).json({ error: 'Cannot grant permissions you do not have' });
    }
    const role = createRole(req.params.id, {
      name: req.body.name,
      color: req.body.color,
      permissions: wanted,
      hoist: req.body.hoist,
    });
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'role_create',
      targetType: 'role',
      targetId: role.id,
    });
    emitToServer(req.params.id, 'role:created', role);
    res.status(201).json(role);
  },
);

const patchRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  permissions: z.number().int().nonnegative().optional(),
  position: z.number().int().nonnegative().optional(),
  hoist: z.boolean().optional(),
});

router.patch('/roles/:id', requireAuth, validateBody(patchRoleSchema), (req, res) => {
  const role = getRole(req.params.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const ctx = getMemberContext(role.server_id, req.userId!);
  if (!canManageRoles(ctx)) {
    return res.status(403).json({ error: 'Missing MANAGE_ROLES' });
  }
  // Escalation guard #2: can't edit a role at/above your highest position.
  if (!canActOnRolePosition(ctx, role.position)) {
    return res.status(403).json({ error: 'Cannot edit a role at or above your highest role' });
  }
  // Escalation guard #1: can't add permission bits you don't hold.
  if (req.body.permissions !== undefined && !canGrantAddedPermissions(ctx, role.permissions, req.body.permissions)) {
    return res.status(403).json({ error: 'Cannot grant permissions you do not have' });
  }
  const updated = updateRole(req.params.id, {
    ...req.body,
    hoist: req.body.hoist === undefined ? undefined : req.body.hoist ? 1 : 0,
  });
  logAudit({
    serverId: role.server_id,
    actorId: req.userId!,
    actionType: 'role_update',
    targetType: 'role',
    targetId: role.id,
  });
  emitToServer(role.server_id, 'role:updated', updated);
  res.json(updated);
});

router.delete('/roles/:id', requireAuth, (req, res) => {
  const role = getRole(req.params.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  if (role.is_default) return res.status(400).json({ error: 'Cannot delete @everyone' });
  const ctx = getMemberContext(role.server_id, req.userId!);
  if (!canManageRoles(ctx)) {
    return res.status(403).json({ error: 'Missing MANAGE_ROLES' });
  }
  if (!canActOnRolePosition(ctx, role.position)) {
    return res.status(403).json({ error: 'Cannot delete a role at or above your highest role' });
  }
  deleteRole(req.params.id);
  logAudit({
    serverId: role.server_id,
    actorId: req.userId!,
    actionType: 'role_delete',
    targetType: 'role',
    targetId: role.id,
  });
  emitToServer(role.server_id, 'role:deleted', { id: role.id, serverId: role.server_id });
  res.json({ ok: true });
});

// Assign / unassign role to a member.
router.put('/servers/:id/members/:userId/roles/:roleId', requireAuth, (req, res) => {
  const { id: serverId, userId, roleId } = req.params;
  const role = getRole(roleId);
  if (!role || role.server_id !== serverId) return res.status(404).json({ error: 'Role not found' });
  if (!isMember(serverId, userId)) return res.status(404).json({ error: 'Member not found' });
  const ctx = getMemberContext(serverId, req.userId!);
  if (!canManageRoles(ctx)) {
    return res.status(403).json({ error: 'Missing MANAGE_ROLES' });
  }
  // Escalation guards: can't assign a role above your own, nor one granting perms you lack.
  if (!canActOnRolePosition(ctx, role.position)) {
    return res.status(403).json({ error: 'Cannot assign a role at or above your highest role' });
  }
  if (!canGrantPermissions(ctx, role.permissions)) {
    return res.status(403).json({ error: 'Cannot assign a role granting permissions you lack' });
  }
  assignRole(serverId, userId, roleId);
  logAudit({
    serverId,
    actorId: req.userId!,
    actionType: 'member_role_add',
    targetType: 'user',
    targetId: userId,
    metadata: { roleId },
  });
  emitToServer(serverId, 'member:roles-updated', { serverId, userId });
  res.json({ ok: true });
});

router.delete('/servers/:id/members/:userId/roles/:roleId', requireAuth, (req, res) => {
  const { id: serverId, userId, roleId } = req.params;
  const role = getRole(roleId);
  if (!role || role.server_id !== serverId) return res.status(404).json({ error: 'Role not found' });
  const ctx = getMemberContext(serverId, req.userId!);
  if (!canManageRoles(ctx)) {
    return res.status(403).json({ error: 'Missing MANAGE_ROLES' });
  }
  if (!canActOnRolePosition(ctx, role.position)) {
    return res.status(403).json({ error: 'Cannot manage a role at or above your highest role' });
  }
  unassignRole(serverId, userId, roleId);
  logAudit({
    serverId,
    actorId: req.userId!,
    actionType: 'member_role_remove',
    targetType: 'user',
    targetId: userId,
    metadata: { roleId },
  });
  emitToServer(serverId, 'member:roles-updated', { serverId, userId });
  res.json({ ok: true });
});

export default router;
