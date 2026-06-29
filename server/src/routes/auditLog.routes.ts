import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireServerPermission } from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { getAuditLog } from '../models/auditLog.model';

const router = Router();

router.get(
  '/servers/:id/audit-log',
  requireAuth,
  requireServerPermission(Permissions.VIEW_AUDIT_LOG),
  (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    res.json(getAuditLog(req.params.id, limit, before));
  },
);

export default router;
