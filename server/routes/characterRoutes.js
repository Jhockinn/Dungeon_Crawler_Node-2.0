import express from 'express';
import * as characterController from '../controllers/characterController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, characterController.getAll);
router.get('/:id', requireAuth, characterController.getOne);
router.post('/', requireAuth, characterController.create);
router.delete('/:id', requireAuth, characterController.deleteCharacter);

// Inventory routes
router.get('/:id/inventory', requireAuth, characterController.getInventory);
router.post('/:id/inventory/equip', requireAuth, characterController.equipItem);
router.delete('/:id/inventory/:inventoryId', requireAuth, characterController.dropItem);

export default router;
