import { useState, useCallback } from 'react';
import api from '../utils/api';

export const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTasks = useCallback(async (status = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = status ? { status } : {};
      const { data } = await api.get('/tasks', { params });
      setTasks(data.tasks);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = async (payload) => {
    const { data } = await api.post('/tasks', payload);
    setTasks((prev) => [data.task, ...prev]);
    return data.task;
  };

  const updateTask = async (id, payload) => {
    const { data } = await api.put(`/tasks/${id}`, payload);
    setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    return data.task;
  };

  const deleteTask = async (id) => {
    await api.delete(`/tasks/${id}`);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    return updateTask(task.id, { status: newStatus });
  };

  return { tasks, loading, error, fetchTasks, createTask, updateTask, deleteTask, toggleStatus };
};
