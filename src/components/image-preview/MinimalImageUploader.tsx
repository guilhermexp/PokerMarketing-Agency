/**
 * MinimalImageUploader
 *
 * Compact uploader for reference images in the AI editor.
 */

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Icon } from '../common/Icon';
import { fileToImageFile } from './types';
import type { MinimalImageUploaderProps } from './uiTypes';

export const MinimalImageUploader: React.FC<MinimalImageUploaderProps> = ({
  onImageChange,
}) => {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        try {
          const imageData = await fileToImageFile(acceptedFiles[0]);
          onImageChange(imageData);
        } catch (e) {
          console.error('Error processing file:', e);
        }
      }
    },
    [onImageChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
  } as import('react-dropzone').DropzoneOptions);

  return (
    <div
      {...getRootProps()}
      className={`inline-flex items-center gap-1.5 px-2 py-1 border border-dashed rounded-md cursor-pointer transition-all ${isDragActive
          ? 'border-white/20 bg-white/[0.02]'
          : 'border-white/[0.08] hover:border-white/15'
        }`}
    >
      <input {...getInputProps()} />
      <Icon name="plus" className="w-3 h-3 text-white/25" />
      <span className="text-[9px] text-white/25">Adicionar</span>
    </div>
  );
};
