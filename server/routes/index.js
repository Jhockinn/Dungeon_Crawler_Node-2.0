import express from 'express';
import authRoutes from './authRoutes.js';
import characterRoutes from './characterRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/characters', characterRoutes);

export default router;
