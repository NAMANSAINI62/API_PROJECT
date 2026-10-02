import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, RefreshCw } from 'lucide-react';
import { projectService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge, Modal, Input, EmptyState, LoadingState, ErrorState, ConfirmModal, Toast } from '../components/UIComponents';

export const Projects = () => {
  const { setSelectedProjectId } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal & Toast States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [toast, setToast] = useState(null);

  const [newProject, setNewProject] = useState({ name: '', description: '', environment: 'production' });
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getAll();
      setProjects(data);
    } catch {
      setError('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await projectService.create(newProject);
      setProjects([...projects, created]);
      setSelectedProjectId(created.id);
      setIsCreateOpen(false);
      setNewProject({ name: '', description: '', environment: 'production' });
      showToast('Project created successfully!');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to create project', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingProject) return;
    setSubmitting(true);
    try {
      const updated = await projectService.update(editingProject.id, {
        name: editingProject.name,
        description: editingProject.description,
        environment: editingProject.environment,
      });
      setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
      setIsEditOpen(false);
      setEditingProject(null);
      showToast('Project updated successfully!');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update project', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingProjectId) return;
    setSubmitting(true);
    try {
      await projectService.delete(deletingProjectId);
      setProjects(projects.filter((p) => p.id !== deletingProjectId));
      setDeletingProjectId(null);
      showToast('Project deleted successfully!');
    } catch {
      showToast('Failed to delete project.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState message="Loading projects..." />;
  if (error) return <ErrorState message={error} onRetry={fetchProjects} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#17212B]">Projects</h1>
          <p className="text-xs text-[#687680]">Manage developer environments and project settings</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="secondary" size="sm" onClick={fetchProjects}>
            <RefreshCw className="w-3.5 h-3.5 mr-1 text-[#687680]" /> Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> New Project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start using PulseGate API gateway."
          actionText="Create Project"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] border-b border-[#E4E9EE] text-[#687680] font-medium">
              <tr>
                <th className="py-3 px-4">Project Name</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E9EE]">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-[#F4F7F9]">
                  <td className="py-3.5 px-4 font-semibold text-[#17212B]">
                    <div>{p.name}</div>
                    {p.description && <div className="text-[11px] text-[#8A969F] font-normal">{p.description}</div>}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={p.environment === 'production' ? 'success' : 'info'}>
                      {p.environment}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-[#687680]">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingProject({ ...p });
                        setIsEditOpen(true);
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1 text-[#687680]" /> Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeletingProjectId(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. Payments Microservice"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            required
          />
          <Input
            label="Description"
            placeholder="Brief project details"
            value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#687680]">Environment</label>
            <select
              value={newProject.environment}
              onChange={(e) => setNewProject({ ...newProject, environment: e.target.value })}
              className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
            >
              <option value="production">Production</option>
              <option value="development">Development</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-3">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Project Settings">
        {editingProject && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <Input
              label="Project Name"
              value={editingProject.name}
              onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
              required
            />
            <Input
              label="Description"
              value={editingProject.description || ''}
              onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#687680]">Environment</label>
              <select
                value={editingProject.environment}
                onChange={(e) => setEditingProject({ ...editingProject, environment: e.target.value })}
                className="w-full px-3.5 py-2 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm focus:outline-none focus:border-[#159A8A]"
              >
                <option value="production">Production</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3 pt-3">
              <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProjectId}
        onClose={() => setDeletingProjectId(null)}
        onConfirm={confirmDelete}
        title="Delete Project?"
        message="Are you sure you want to delete this project? All associated API keys, request logs, and usage data will be permanently deleted. This action cannot be undone."
        confirmText="Delete Project"
        variant="danger"
        isLoading={submitting}
      />

      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
