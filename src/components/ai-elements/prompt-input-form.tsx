"use client";

import type { FileUIPart } from "ai";
import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import {
  type ChangeEvent,
  type ChangeEventHandler,
  type FormEvent,
  type FormEventHandler,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AttachmentsContext,
  useOptionalPromptInputController,
} from "./prompt-input-context";
import {
  LocalAttachmentsContext,
  usePromptInputAttachments,
} from "./prompt-input-attachments";

export type PromptInputMessage = {
  text: string;
  files: FileUIPart[];
};

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  accept?: string;
  multiple?: boolean;
  globalDrop?: boolean;
  syncHiddenInput?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  onError?: (err: {
    code: "max_files" | "max_file_size" | "accept";
    message: string;
  }) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export const PromptInput = ({
  accept,
  children,
  className,
  globalDrop,
  maxFiles,
  maxFileSize,
  multiple,
  onError,
  onSubmit,
  syncHiddenInput,
  ...props
}: PromptInputProps) => {
  const controller = useOptionalPromptInputController();
  const usingProvider = Boolean(controller);
  const providerController = controller ?? null;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [items, setItems] = useState<(FileUIPart & { id: string })[]>([]);
  const files = usingProvider ? providerController!.attachments.files : items;
  const filesRef = useRef(files);
  filesRef.current = files;

  const openFileDialogLocal = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const matchesAccept = useCallback(
    (file: File) => {
      if (!accept || accept.trim() === "") {
        return true;
      }

      const patterns = accept
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      return patterns.some((pattern) => {
        if (pattern.endsWith("/*")) {
          return file.type.startsWith(pattern.slice(0, -1));
        }
        return file.type === pattern;
      });
    },
    [accept],
  );

  const addLocal = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = Array.from(fileList);
      const accepted = incoming.filter((file) => matchesAccept(file));

      if (incoming.length > 0 && accepted.length === 0) {
        onError?.({
          code: "accept",
          message: "No files match the accepted types.",
        });
        return;
      }

      const sized = accepted.filter((file) =>
        maxFileSize ? file.size <= maxFileSize : true,
      );
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({
          code: "max_file_size",
          message: "All files exceed the maximum size.",
        });
        return;
      }

      setItems((prev) => {
        const capacity =
          typeof maxFiles === "number" ? Math.max(0, maxFiles - prev.length) : undefined;
        const capped =
          typeof capacity === "number" ? sized.slice(0, capacity) : sized;

        if (typeof capacity === "number" && sized.length > capacity) {
          onError?.({
            code: "max_files",
            message: "Too many files. Some were not added.",
          });
        }

        return prev.concat(
          capped.map((file) => ({
            id: nanoid(),
            type: "file" as const,
            url: URL.createObjectURL(file),
            mediaType: file.type,
            filename: file.name,
          })),
        );
      });
    },
    [matchesAccept, maxFiles, maxFileSize, onError],
  );

  const removeLocal = useCallback((id: string) => {
    setItems((prev) => {
      const found = prev.find((file) => file.id === id);
      if (found?.url) {
        URL.revokeObjectURL(found.url);
      }
      return prev.filter((file) => file.id !== id);
    });
  }, []);

  const clearLocal = useCallback(() => {
    setItems((prev) => {
      for (const file of prev) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
      return [];
    });
  }, []);

  const add = usingProvider ? providerController!.attachments.add : addLocal;
  const remove = usingProvider
    ? providerController!.attachments.remove
    : removeLocal;
  const clear = usingProvider ? providerController!.attachments.clear : clearLocal;
  const openFileDialog = usingProvider
    ? providerController!.attachments.openFileDialog
    : openFileDialogLocal;

  useEffect(() => {
    if (!usingProvider) {
      return;
    }
    providerController!.__registerFileInput(inputRef, () => inputRef.current?.click());
  }, [usingProvider, providerController]);

  useEffect(() => {
    if (syncHiddenInput && inputRef.current && files.length === 0) {
      inputRef.current.value = "";
    }
  }, [files, syncHiddenInput]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || globalDrop) {
      return;
    }

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };

    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
      if (event.dataTransfer?.files?.length) {
        add(event.dataTransfer.files);
      }
    };

    form.addEventListener("dragover", onDragOver);
    form.addEventListener("drop", onDrop);

    return () => {
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("drop", onDrop);
    };
  }, [add, globalDrop]);

  useEffect(() => {
    if (!globalDrop) {
      return;
    }

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };

    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
      if (event.dataTransfer?.files?.length) {
        add(event.dataTransfer.files);
      }
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [add, globalDrop]);

  useEffect(() => {
    return () => {
      if (usingProvider) {
        return;
      }

      for (const file of filesRef.current) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
    };
  }, [usingProvider]);

  const convertBlobUrlToDataUrl = useCallback(async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }, []);

  const localAttachments = useCallback(
    (): AttachmentsContext => ({
      add,
      clear,
      fileInputRef: inputRef,
      files: files.map((item) => ({ ...item, id: item.id })),
      openFileDialog,
      remove,
    }),
    [add, clear, files, openFileDialog, remove],
  );

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.currentTarget.files) {
      add(event.currentTarget.files);
    }
    event.currentTarget.value = "";
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const text = usingProvider
      ? providerController!.textInput.value
      : ((new FormData(form).get("message") as string) || "");

    if (!usingProvider) {
      form.reset();
    }

    Promise.all(
      files.map(async ({ id, ...item }) => {
        if (item.url.startsWith("blob:")) {
          const dataUrl = await convertBlobUrlToDataUrl(item.url);
          return { ...item, url: dataUrl ?? item.url };
        }
        return item;
      }),
    )
      .then((convertedFiles: FileUIPart[]) => {
        try {
          const result = onSubmit({ text, files: convertedFiles }, event);
          const finalize = () => {
            clear();
            if (usingProvider) {
              providerController!.textInput.clear();
            }
          };

          if (result instanceof Promise) {
            result.then(finalize).catch(() => {});
          } else {
            finalize();
          }
        } catch {
          // Keep current state for retry.
        }
      })
      .catch(() => {});
  };

  const inner = (
    <>
      <form
        className={cn("w-full", className)}
        ref={formRef}
        onSubmit={handleSubmit}
        {...props}
      >
        <input
          accept={accept}
          aria-label="Upload files"
          className="hidden"
          multiple={multiple}
          onChange={handleFileChange}
          ref={inputRef}
          title="Upload files"
          type="file"
        />
        <InputGroup className="overflow-hidden">{children}</InputGroup>
      </form>
    </>
  );

  return usingProvider ? (
    inner
  ) : (
    <LocalAttachmentsContext.Provider value={localAttachments()}>
      {inner}
    </LocalAttachmentsContext.Provider>
  );
};
