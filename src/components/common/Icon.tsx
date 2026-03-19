import type { ComponentType, SVGProps } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bookmark,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Code,
  Copy,
  DollarSign,
  Download,
  Edit,
  Edit2,
  Edit3,
  Eraser,
  ExternalLink,
  Eye,
  Facebook,
  FileText,
  Folder,
  FolderOpen,
  GalleryHorizontal,
  GalleryVerticalEnd,
  Globe,
  Hash,
  Heart,
  Image,
  Inbox,
  Info,
  Instagram,
  Layers,
  Layout,
  LayoutGrid,
  Link,
  Loader,
  LogOut,
  Mail,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Moon,
  MoreHorizontal,
  Move,
  MousePointer2,
  Palette,
  Paperclip,
  Pause,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Search,
  Send,
  Settings,
  Share,
  Share2,
  Shield,
  Sliders,
  Sparkles,
  Square,
  Star,
  Sun,
  ThumbsUp,
  Trash,
  Trash2,
  Trophy,
  Upload,
  User,
  UserPlus,
  Users,
  Video,
  Volume2,
  Wand2,
  X,
  XCircle,
  Zap,
} from "lucide-react";

export type IconName = string;

type LucideIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number | string;
  }
>;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

const iconMap: Record<string, LucideIconComponent> = {
  logo: PenTool,
  zap: Zap,
  image: Image,
  clock: Clock,
  edit: Edit,
  share: Share,
  upload: Upload,
  arrowRight: ArrowRight,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  x: X,
  "x-circle": XCircle,
  "dollar-sign": DollarSign,
  trophy: Trophy,
  users: Users,
  settings: Settings,
  calendar: Calendar,
  globe: Globe,
  search: Search,
  download: Download,
  bot: Bot,
  send: Send,
  sun: Sun,
  moon: Moon,
  layout: Layout,
  paperclip: Paperclip,
  scissors: Scissors,
  "share-alt": Share2,
  play: Play,
  pause: Pause,
  video: Video,
  film: Video,
  heart: Heart,
  star: Star,
  copy: Copy,
  instagram: Instagram,
  facebook: Facebook,
  plus: Plus,
  minus: Minus,
  check: Check,
  "check-circle": CheckCircle,
  trash: Trash,
  "trash-2": Trash2,
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  eye: Eye,
  refresh: RotateCw,
  "refresh-cw": RefreshCw,
  audio: AudioLines,
  mic: Mic,
  "mic-off": MicOff,
  layers: GalleryHorizontal,
  kanban: LayoutGrid,
  "folder-open": FolderOpen,
  folder: Folder,
  "poker-chip": null as unknown as LucideIconComponent, // custom SVG below
  building: Building2,
  user: User,
  mail: Mail,
  "user-plus": UserPlus,
  "log-out": LogOut,
  shield: Shield,
  palette: Palette,
  inbox: Inbox,
  stories: GalleryVerticalEnd,
  "external-link": ExternalLink,
  link: Link,
  info: Info,
  sliders: Sliders,
  "message-circle": MessageCircle,
  bookmark: Bookmark,
  "more-horizontal": MoreHorizontal,
  move: Move,
  square: Square,
  "maximize-2": Maximize2,
  "wand-2": Wand2,
  "edit-2": Edit2,
  "edit-3": Edit3,
  briefcase: Briefcase,
  "check-square": CheckSquare,
  "volume-2": Volume2,
  camera: Camera,
  eraser: Eraser,
  hash: Hash,
  loader: Loader,
  "mouse-pointer-2": MousePointer2,
  sparkles: Sparkles,
  "thumbs-up": ThumbsUp,
  code: Code,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
};

export function Icon({
  name,
  className,
  size = 24,
  strokeWidth = 2,
  "aria-hidden": ariaHidden = true,
  ...props
}: IconProps) {
  // Custom SVG icons not available in lucide-react
  if (name === "poker-chip") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        data-icon={name}
        aria-hidden={ariaHidden}
        focusable="false"
        {...props}
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="3" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="3" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21" y2="12" />
        <line x1="5.64" y1="5.64" x2="8.46" y2="8.46" />
        <line x1="15.54" y1="15.54" x2="18.36" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="15.54" y2="8.46" />
        <line x1="8.46" y1="15.54" x2="5.64" y2="18.36" />
      </svg>
    );
  }

  const IconComponent = iconMap[name] ?? Info;

  return (
    <IconComponent
      aria-hidden={ariaHidden}
      className={className}
      data-icon={name}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
