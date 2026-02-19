/**
 * TopicsSidebar
 * Right sidebar with list of topics (projects)
 * Professional design matching Video Studio
 */

import React, { useCallback, useState } from 'react';
import {
  Plus,
  Image,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
  Film,
} from 'lucide-react';
import { useImagePlaygroundTopics } from '../../hooks/useImagePlayground';
import { useImagePlaygroundStore } from '../../stores/imagePlaygroundStore';
import type { ImageGenerationTopic } from '../../stores/imagePlaygroundStore';

export const TopicsSidebar: React.FC = () => {
  const { topics, isLoading: topicsLoading, createTopic, deleteTopic, updateTopic } =
    useImagePlaygroundTopics();
  const { activeTopicId, switchTopic } = useImagePlaygroundStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTopic = useCallback(async () => {
    setIsCreating(true);
    try {
      await createTopic();
    } catch (err) {
      console.error('Failed to create topic:', err);
    } finally {
      setIsCreating(false);
    }
  }, [createTopic]);

  return (
    <div className="h-full flex flex-col bg-black/30 backdrop-blur-2xl">
      {/* Header - Just the + button */}
      <div className="px-2.5 py-3 border-b border-white/[0.06] flex items-center justify-center">
        <button
          onClick={handleCreateTopic}
          disabled={isCreating}
          className="w-[52px] h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all disabled:opacity-50 inline-flex items-center justify-center group/add"
          title="Novo projeto"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 text-white/40 animate-spin shrink-0" />
          ) : (
            <Plus className="w-4 h-4 text-white/40 group-hover/add:text-white/70 transition-colors shrink-0" />
          )}
        </button>
      </div>

      {/* Topics List */}
      <div className="flex-1 overflow-y-auto py-2.5 px-2.5">
        {topicsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <Image className="w-4 h-4 text-white/15" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => (
              <TopicItem
                key={topic.id}
                topic={topic}
                isActive={topic.id === activeTopicId}
                onSelect={() => switchTopic(topic.id)}
                onDelete={() => deleteTopic(topic.id)}
                onRename={(title) => updateTopic(topic.id, { title })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// TopicItem Component
// =============================================================================

interface TopicItemProps {
  topic: ImageGenerationTopic;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

const TopicItem: React.FC<TopicItemProps> = ({
  topic,
  isActive,
  onSelect,
  onDelete,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(topic.title || '');
  const [coverError, setCoverError] = useState(false);

  const handleStartEdit = useCallback(() => {
    setEditTitle(topic.title || '');
    setIsEditing(true);
  }, [topic.title]);

  const handleSaveEdit = useCallback(() => {
    if (editTitle.trim()) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  }, [editTitle, onRename]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditTitle(topic.title || '');
  }, [topic.title]);

  const handleDelete = useCallback(() => {
    if (confirm(`Excluir "${topic.title || 'Novo projeto'}" e todas as suas imagens?`)) {
      onDelete();
    }
  }, [topic.title, onDelete]);

  if (isEditing) {
    return (
      <div className="p-2 bg-white/[0.06] rounded-xl border border-white/[0.1]">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          autoFocus
          className="w-full bg-transparent text-[11px] text-white focus:outline-none"
          placeholder="Nome do projeto"
        />
        <div className="flex items-center justify-end gap-1 mt-1.5">
          <button
            onClick={handleCancelEdit}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-3 h-3 text-white/40" />
          </button>
          <button
            onClick={handleSaveEdit}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <Check className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative group rounded-xl transition-all duration-200 cursor-pointer overflow-hidden ${
        isActive
            ? 'ring-2 ring-white/40 shadow-[0_0_12px_rgba(255,255,255,0.08)]'
          : 'hover:ring-1 hover:ring-white/[0.15]'
      }`}
    >
      {/* Thumbnail */}
      <button
        onClick={onSelect}
        className="w-full aspect-square bg-white/[0.03] overflow-hidden"
      >
        {topic.coverUrl && !coverError ? (
          <img
            src={topic.coverUrl}
            alt={topic.title || 'Projeto'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setCoverError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
            <Image className="w-5 h-5 text-white/20" />
          </div>
        )}
      </button>

      {/* Hover Overlay with Actions */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200 flex flex-col justify-end p-1.5 pointer-events-none opacity-0 group-hover:opacity-100">
        {/* Title */}
        <p className="text-[9px] text-white font-medium truncate mb-1 px-0.5">
          {topic.title || 'Novo projeto'}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            title="Renomear"
          >
            <Edit3 className="w-2.5 h-2.5 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1 rounded-md bg-white/10 hover:bg-red-500/40 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-2.5 h-2.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopicsSidebar;
