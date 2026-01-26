/**
 * TopicsSidebar
 * Right sidebar with list of topics (projects)
 * Design based on LobeChat reference - minimal with thumbnails
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
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
      {/* Header - Just the + button */}
      <div className="px-3 py-3 border-b border-white/10 flex items-center justify-center">
        <button
          onClick={handleCreateTopic}
          disabled={isCreating}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 inline-flex items-center justify-center"
          title="Novo projeto"
        >
          {isCreating ? (
            <Loader2 className="w-5 h-5 text-white/60 animate-spin shrink-0" />
          ) : (
            <Plus className="w-5 h-5 text-white/60 shrink-0" />
          )}
        </button>
      </div>

      {/* Topics List - Grid of thumbnails */}
      <div className="flex-1 overflow-y-auto py-3 px-3">
        {topicsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mx-auto">
              <Image className="w-7 h-7 text-white/30" />
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
  const [showMenu, setShowMenu] = useState(false);

  const handleStartEdit = useCallback(() => {
    setEditTitle(topic.title || '');
    setIsEditing(true);
    setShowMenu(false);
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
    setShowMenu(false);
  }, [topic.title, onDelete]);

  if (isEditing) {
    return (
      <div className="p-2 bg-white/5 rounded-xl border border-white/10">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          autoFocus
          className="w-full bg-transparent text-sm text-white focus:outline-none"
          placeholder="Nome do projeto"
        />
        <div className="flex items-center justify-end gap-1 mt-2">
          <button
            onClick={handleCancelEdit}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
          <button
            onClick={handleSaveEdit}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative group rounded-xl transition-colors cursor-pointer overflow-hidden ${
        isActive
          ? 'ring-2 ring-primary/50'
          : 'hover:ring-1 hover:ring-white/20'
      }`}
    >
      {/* Thumbnail */}
      <button
        onClick={onSelect}
        className="w-full aspect-square bg-white/5 overflow-hidden"
      >
        {topic.coverUrl ? (
          <img
            src={topic.coverUrl}
            alt={topic.title || 'Projeto'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-8 h-8 text-white/20" />
          </div>
        )}
      </button>

      {/* Hover Overlay with Actions */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity flex flex-col justify-end p-2 ${
          showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {/* Title */}
        <p className="text-xs text-white font-medium truncate mb-1">
          {topic.title || 'Novo projeto'}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Renomear"
          >
            <Edit3 className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopicsSidebar;
