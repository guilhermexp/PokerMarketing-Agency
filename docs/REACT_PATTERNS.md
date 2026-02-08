# Padrões React/TypeScript - PokerMarketing Agency

> Guia de boas práticas e padrões de código baseados na estrutura do projeto

## Índice
1. [Estrutura de Componentes](#estrutura-de-componentes)
2. [TypeScript](#typescript)
3. [Hooks](#hooks)
4. [Estado e Props](#estado-e-props)
5. [Eventos](#eventos)
6. [Conditional Rendering](#conditional-rendering)
7. [Performance](#performance)
8. [Padrões Comuns](#padrões-comuns)

---

## Estrutura de Componentes

### Componente Funcional - Base

```tsx
import React, { useState } from "react";
import { Icon } from "../common/Icon";
import type { Post } from "../../types";

interface PostCardProps {
  post: Post;
  onUpdate: (postId: string, updates: Partial<Post>) => void;
  onDelete: (postId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onUpdate,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleUpdate = () => {
    onUpdate(post.id, { status: 'published' });
  };

  return (
    <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-4">
      {/* Component content */}
    </div>
  );
};
```

### Organização de Imports

```tsx
// 1. React e hooks
import React, { useState, useEffect, useMemo } from "react";

// 2. Tipos
import type { Post, User, Campaign } from "../../types";
import type { ApiResponse } from "../../services/apiClient";

// 3. Componentes
import { Icon } from "../common/Icon";
import { Button } from "../ui/Button";

// 4. Hooks personalizados
import { useAuth } from "../../hooks/useAuth";
import { useAppData } from "../../hooks/useAppData";

// 5. Serviços e utils
import { formatDate } from "../../utils/dateUtils";
import { apiClient } from "../../services/apiClient";

// 6. Constantes
import { STATUS_COLORS } from "../../constants";
```

---

## TypeScript

### Definição de Props

```tsx
// ✅ FAZER: Props explícitas com interface
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  className = '',
}) => {
  // Component implementation
};

// ❌ EVITAR: Props sem tipo
export const Button = ({ children, variant, onClick }) => {
  // Código sem tipagem
};
```

### Tipos para Eventos

```tsx
// ✅ FAZER: Tipar eventos corretamente
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.stopPropagation();
  // Handle click
};

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
};

const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  // Handle submit
};

// ❌ EVITAR: any ou sem tipo
const handleClick = (e: any) => {
  // Código sem tipagem adequada
};
```

### Tipos Customizados

```tsx
// types.ts
export interface ScheduledPost {
  id: string;
  caption: string;
  imageUrl?: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledTimestamp: number;
  status: PostStatus;
  platforms: PostPlatform;
  hashtags: string[];
  campaignId?: string;
  instagramContentType?: InstagramContentType;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PostStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type PostPlatform = 'instagram' | 'facebook' | 'both';
export type InstagramContentType = 'photo' | 'story' | 'reel' | 'carousel';

// Uso no componente
import type { ScheduledPost, PostStatus } from "../../types";
```

### Utility Types

```tsx
// Partial - Para updates
const updatePost = (postId: string, updates: Partial<ScheduledPost>) => {
  // updates pode ter qualquer propriedade de ScheduledPost
};

// Omit - Para remover propriedades
type NewPost = Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>;

const createPost = (post: NewPost) => {
  // post não precisa de id, createdAt, updatedAt
};

// Pick - Para selecionar propriedades específicas
type PostPreview = Pick<ScheduledPost, 'id' | 'caption' | 'imageUrl'>;

// Record - Para objetos com chaves dinâmicas
type StatusColors = Record<PostStatus, string>;

const statusColors: StatusColors = {
  scheduled: 'bg-amber-500/10',
  publishing: 'bg-amber-500/10',
  published: 'bg-green-500/10',
  failed: 'bg-red-500/10',
  cancelled: 'bg-white/5'
};
```

---

## Hooks

### useState - Estado Local

```tsx
// ✅ FAZER: Inicializar com tipo correto
const [isOpen, setIsOpen] = useState<boolean>(false);
const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
const [posts, setPosts] = useState<ScheduledPost[]>([]);

// Estado derivado com useState
const [filter, setFilter] = useState<'all' | 'scheduled' | 'published'>('all');

// ❌ EVITAR: Sem tipo quando não é óbvio
const [data, setData] = useState(null); // Qual é o tipo?
```

### useEffect - Efeitos Colaterais

```tsx
// ✅ FAZER: useEffect com dependências corretas
useEffect(() => {
  const fetchPosts = async () => {
    const data = await apiClient.getPosts();
    setPosts(data);
  };

  fetchPosts();
}, []); // Roda apenas uma vez no mount

// Cleanup em useEffect
useEffect(() => {
  const interval = setInterval(() => {
    checkNotifications();
  }, 60000);

  return () => clearInterval(interval); // Cleanup no unmount
}, [scheduledPosts]);

// ❌ EVITAR: useEffect sem array de dependências
useEffect(() => {
  fetchData(); // Roda em todo render!
});

// ❌ EVITAR: Dependências incompletas
useEffect(() => {
  fetchPostById(postId); // postId deveria estar nas dependências
}, []); // Missing dependency: postId
```

### useMemo - Memoização de Valores

```tsx
// ✅ FAZER: Memoizar cálculos complexos
const filteredPosts = useMemo(() => {
  return scheduledPosts.filter((post) => {
    if (filter === 'all') return true;
    return post.status === filter;
  });
}, [scheduledPosts, filter]);

// Memoizar objetos complexos
const stats = useMemo(() => {
  const scheduled = scheduledPosts.filter(p => p.status === 'scheduled').length;
  const published = scheduledPosts.filter(p => p.status === 'published').length;
  const failed = scheduledPosts.filter(p => p.status === 'failed').length;
  return { scheduled, published, failed, total: scheduledPosts.length };
}, [scheduledPosts]);

// ❌ EVITAR: useMemo desnecessário
const fullName = useMemo(() => {
  return `${firstName} ${lastName}`; // Muito simples para memoizar
}, [firstName, lastName]);
```

### useCallback - Memoização de Funções

```tsx
// ✅ FAZER: useCallback para funções passadas como props
const handleDeletePost = useCallback((postId: string) => {
  setPosts(prev => prev.filter(p => p.id !== postId));
}, []);

const handleUpdatePost = useCallback((postId: string, updates: Partial<ScheduledPost>) => {
  setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
}, []);

// ❌ EVITAR: Criar funções no render sem necessidade
<PostCard
  post={post}
  onDelete={(id) => handleDelete(id)} // Nova função em cada render
/>

// ✅ MELHOR
<PostCard
  post={post}
  onDelete={handleDeletePost}
/>
```

### Custom Hooks

```tsx
// hooks/useScheduledPosts.ts
import { useState, useEffect } from 'react';
import type { ScheduledPost } from '../types';
import { apiClient } from '../services/apiClient';

export const useScheduledPosts = () => {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const data = await apiClient.getScheduledPosts();
        setPosts(data);
        setError(null);
      } catch (err) {
        setError('Erro ao carregar posts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  const addPost = async (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newPost = await apiClient.createScheduledPost(post);
    setPosts(prev => [...prev, newPost]);
  };

  const updatePost = async (postId: string, updates: Partial<ScheduledPost>) => {
    await apiClient.updateScheduledPost(postId, updates);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
  };

  const deletePost = async (postId: string) => {
    await apiClient.deleteScheduledPost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return {
    posts,
    loading,
    error,
    addPost,
    updatePost,
    deletePost,
  };
};

// Uso no componente
const MyComponent = () => {
  const { posts, loading, error, addPost, updatePost, deletePost } = useScheduledPosts();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div>
      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          onUpdate={updatePost}
          onDelete={deletePost}
        />
      ))}
    </div>
  );
};
```

---

## Estado e Props

### Lifting State Up

```tsx
// ✅ FAZER: Estado no componente pai, passado como props
const CalendarPage = () => {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleSchedulePost = (post: Omit<ScheduledPost, 'id'>) => {
    const newPost = { ...post, id: generateId() };
    setScheduledPosts(prev => [...prev, newPost]);
  };

  return (
    <div>
      <CalendarView
        posts={scheduledPosts}
        onSchedulePost={handleSchedulePost}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      <ScheduleModal
        isOpen={!!selectedDate}
        selectedDate={selectedDate}
        onClose={() => setSelectedDate(null)}
        onSchedule={handleSchedulePost}
      />
    </div>
  );
};
```

### Props Drilling vs Context

```tsx
// ❌ EVITAR: Props drilling excessivo
<GrandParent userId={userId}>
  <Parent userId={userId}>
    <Child userId={userId}>
      <GrandChild userId={userId} />
    </Child>
  </Parent>
</GrandParent>

// ✅ MELHOR: Usar Context para dados globais
// contexts/AuthContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface AuthContextType {
  userId: string | null;
  login: (userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);

  const login = (id: string) => setUserId(id);
  const logout = () => setUserId(null);

  return (
    <AuthContext.Provider value={{ userId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Uso
const GrandChild = () => {
  const { userId } = useAuth();
  return <div>User ID: {userId}</div>;
};
```

---

## Eventos

### Event Handlers

```tsx
// ✅ FAZER: Nomear handlers com 'handle'
const handleClick = () => {
  console.log('Clicked');
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  // Handle form submission
};

// Passar dados do evento
const handlePostClick = (post: ScheduledPost) => {
  setSelectedPost(post);
  setModalOpen(true);
};

// Stop propagation quando necessário
const handleCardClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  // Handle click
};

// ❌ EVITAR: Inline functions para lógica complexa
<button onClick={() => {
  // 20 linhas de código aqui
  // ...
}}>
  Click
</button>
```

### Event Bubbling

```tsx
// ✅ FAZER: Controlar propagação de eventos
<div
  onClick={() => handleDayClick(date)}
  className="calendar-day">
  <div
    onClick={(e) => {
      e.stopPropagation(); // Não ativa handleDayClick
      handlePostClick(post);
    }}
    className="post-card">
    {post.caption}
  </div>
</div>
```

---

## Conditional Rendering

### If/Else Básico

```tsx
// ✅ FAZER: Conditional rendering claro
const PostCard = ({ post }) => {
  if (!post) return null;

  if (post.status === 'deleted') {
    return <DeletedPostPlaceholder />;
  }

  return <PostContent post={post} />;
};

// Ternário para casos simples
const StatusBadge = ({ status }) => (
  <div className={status === 'published' ? 'bg-green-500' : 'bg-amber-500'}>
    {status}
  </div>
);

// && para renderização condicional
const PostActions = ({ canEdit }) => (
  <div>
    {canEdit && (
      <button onClick={handleEdit}>Editar</button>
    )}
  </div>
);
```

### Renderização de Listas

```tsx
// ✅ FAZER: Sempre usar key única
{posts.map((post) => (
  <PostCard
    key={post.id} // ID único e estável
    post={post}
    onUpdate={handleUpdate}
    onDelete={handleDelete}
  />
))}

// ❌ EVITAR: Index como key
{posts.map((post, index) => (
  <PostCard key={index} post={post} /> // Pode causar bugs
))}

// Empty state
{posts.length === 0 ? (
  <EmptyState
    icon="inbox"
    title="Nenhum post encontrado"
    description="Comece criando seu primeiro post agendado"
    action={{ label: 'Criar Post', onClick: handleCreate }}
  />
) : (
  posts.map((post) => <PostCard key={post.id} post={post} />)
)}
```

---

## Performance

### React.memo - Memoização de Componentes

```tsx
// ✅ FAZER: Memoizar componentes pesados
export const PostCard = React.memo<PostCardProps>(({
  post,
  onUpdate,
  onDelete,
}) => {
  return (
    <div className="post-card">
      {/* Component content */}
    </div>
  );
});

PostCard.displayName = 'PostCard';

// Com comparação customizada
export const PostCard = React.memo<PostCardProps>(
  ({ post, onUpdate, onDelete }) => {
    return <div className="post-card">{/* content */}</div>;
  },
  (prevProps, nextProps) => {
    // Retorna true se props são iguais (não re-renderizar)
    return prevProps.post.id === nextProps.post.id &&
           prevProps.post.status === nextProps.post.status;
  }
);
```

### Lazy Loading

```tsx
// ✅ FAZER: Lazy load componentes grandes
import React, { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

const App = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <HeavyComponent />
  </Suspense>
);
```

---

## Padrões Comuns

### Modal Pattern

```tsx
// components/modals/SchedulePostModal.tsx
interface SchedulePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (post: NewPost) => void;
  initialDate?: string;
}

export const SchedulePostModal: React.FC<SchedulePostModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  initialDate,
}) => {
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState(initialDate || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSchedule({ caption, date });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Form content */}
        </form>
      </div>
    </div>
  );
};
```

### Form Pattern

```tsx
interface FormData {
  caption: string;
  date: string;
  time: string;
  platform: 'instagram' | 'facebook' | 'both';
}

export const PostForm = ({ onSubmit, initialData }: PostFormProps) => {
  const [formData, setFormData] = useState<FormData>(initialData || {
    caption: '',
    date: '',
    time: '',
    platform: 'instagram',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const handleChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.caption.trim()) {
      newErrors.caption = 'Legenda é obrigatória';
    }

    if (!formData.date) {
      newErrors.date = 'Data é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-white/70">Legenda</label>
        <textarea
          value={formData.caption}
          onChange={handleChange('caption')}
          className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-primary/50"
          rows={4}
        />
        {errors.caption && (
          <p className="text-xs text-red-400 mt-1">{errors.caption}</p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-white/70">Data</label>
          <input
            type="date"
            value={formData.date}
            onChange={handleChange('date')}
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-primary/50"
          />
          {errors.date && (
            <p className="text-xs text-red-400 mt-1">{errors.date}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-white/70">Hora</label>
          <input
            type="time"
            value={formData.time}
            onChange={handleChange('time')}
            className="w-28 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
        Agendar Post
      </button>
    </form>
  );
};
```

### Loading Pattern

```tsx
// components/common/LoadingState.tsx
interface LoadingStateProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  size = 'md',
  text = 'Carregando...',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className={`${sizeClasses[size]} border-2 border-white/20 border-t-white/60 rounded-full animate-spin`} />
      {text && (
        <p className="text-sm text-white/60 mt-3">{text}</p>
      )}
    </div>
  );
};

// Uso
const MyComponent = () => {
  const { data, loading, error } = useData();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return <DataView data={data} />;
};
```

### Error Boundary Pattern

```tsx
// components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <Icon name="alert-circle" className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-sm font-semibold text-white/70 mb-1">
            Algo deu errado
          </h3>
          <p className="text-xs text-white/40 text-center max-w-xs mb-4">
            {this.state.error?.message || 'Erro desconhecido'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
            Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Uso
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

---

## Conclusão

Este guia estabelece os padrões React/TypeScript para o PokerMarketing Agency. Principais pontos:

- **TypeScript rigoroso** para prevenir erros
- **Hooks corretamente** para gerenciar estado e efeitos
- **Performance otimizada** com memoização quando necessário
- **Padrões consistentes** para componentes comuns
- **Error handling robusto** para melhor UX

Siga estas práticas para manter o código limpo, manutenível e performático.
