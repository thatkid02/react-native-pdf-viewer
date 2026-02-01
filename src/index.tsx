import { getHostComponent, callback } from 'react-native-nitro-modules';
import type { HybridRef } from 'react-native-nitro-modules';
const PdfViewerConfig = require('../nitrogen/generated/shared/json/PdfViewerConfig.json');
import type { PdfViewerMethods, PdfViewerProps } from './PdfViewer.nitro';

export const PdfViewerView = getHostComponent<PdfViewerProps, PdfViewerMethods>(
  'PdfViewer',
  () => PdfViewerConfig
);

// HybridRef type for ref prop
export type PdfViewerRef = HybridRef<PdfViewerProps, PdfViewerMethods>;

// Re-export types
export type {
  LoadCompleteEvent,
  PageChangeEvent,
  ScaleChangeEvent,
  ErrorEvent,
  ThumbnailGeneratedEvent,
  LoadingChangeEvent,
  PdfViewerProps,
  PdfViewerMethods,
} from './PdfViewer.nitro';

// Re-export callback utility
export { callback };
