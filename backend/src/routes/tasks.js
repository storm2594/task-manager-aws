const express = require('express');
const { body } = require('express-validator');
const { getTasks, createTask, updateTask, deleteTask } = require('../controllers/taskController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', getTasks);

router.post('/', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 255 }),
  body('description').optional().trim(),
], createTask);

router.put('/:id', [
  body('title').optional().trim().notEmpty().isLength({ max: 255 }),
  body('description').optional().trim(),
  body('status').optional().isIn(['pending', 'completed']).withMessage('Status must be pending or completed'),
], updateTask);

router.delete('/:id', deleteTask);

module.exports = router;
