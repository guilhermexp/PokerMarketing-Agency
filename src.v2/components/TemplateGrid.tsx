"use client";

interface TemplateCard {
  id: number;
  title: string;
  description: string;
  images: string[];
  span?: "wide" | "normal";
}

const templates: TemplateCard[] = [
  {
    id: 1,
    title: "Product Ad",
    description: "Transform your product into a clean, professional advertisement",
    images: [
      "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=500&fit=crop",
    ],
    span: "normal",
  },
  {
    id: 2,
    title: "UGC Ad",
    description: "Create authentic user-generated content style ads with your product",
    images: [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=500&fit=crop",
    ],
    span: "wide",
  },
  {
    id: 3,
    title: "Add Product Into a Scene",
    description: "Seamlessly insert your product into any scene with accurate lighting and shadows",
    images: [
      "https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&h=500&fit=crop",
    ],
    span: "normal",
  },
  {
    id: 4,
    title: "Fashion Lookbook",
    description: "Create stunning fashion photography with professional lighting",
    images: [
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
    ],
    span: "normal",
  },
  {
    id: 5,
    title: "Urban Street Style",
    description: "Capture urban aesthetics with cinematic street photography",
    images: [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=500&fit=crop",
    ],
    span: "wide",
  },
  {
    id: 6,
    title: "Travel Content",
    description: "Transform travel moments into engaging visual stories",
    images: [
      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&h=500&fit=crop",
      "https://images.unsplash.com/photo-1504150558240-0b4fd8946624?w=400&h=500&fit=crop",
    ],
    span: "normal",
  },
];

export function TemplateGrid() {
  return (
    <div className="grid grid-cols-12 gap-3">
      {templates.map((template) => (
        <div
          key={template.id}
          className={`group relative cursor-pointer overflow-hidden rounded-xl ${
            template.span === "wide" ? "col-span-4" : "col-span-4"
          }`}
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900">
            <div className="flex h-full">
              {template.images.map((image, index) => (
                <div
                  key={index}
                  className="relative flex-1 overflow-hidden"
                  style={{
                    width: `${100 / template.images.length}%`,
                  }}
                >
                  <img
                    src={image}
                    alt={`${template.title} preview ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-sm font-semibold text-white">{template.title}</h3>
              <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{template.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
