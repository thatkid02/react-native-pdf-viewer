import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules';

export interface LoadCompleteEvent {
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PageChangeEvent {
  page: number;
  pageCount: number;
}

export interface ScaleChangeEvent {
  scale: number;
}

export interface ErrorEvent {
  message: string;
  code: string;
}

export interface ThumbnailGeneratedEvent {
  page: number;
  uri: string;
}

export interface LoadingChangeEvent {
  isLoading: boolean;
}

// iOS-only props for scroll direction and paging
export interface IOSPdfViewerProps {
  // Layout options (iOS only)
  horizontal?: boolean;
  enablePaging?: boolean;
}

export interface PdfViewerProps extends HybridViewProps {
  /**
   * PDF source URI
   * @supported file://, http://, https://
   * @security For production apps, prefer https:// URLs to ensure secure content delivery
   * @example "https://example.com/document.pdf"
   * @example "file:///path/to/local/document.pdf"
   */
  source?: string;

  // Layout options
  /**
   * Horizontal scroll direction (iOS only)
   * @platform ios
   */
  horizontal?: boolean;
  /**
   * Enable paging mode (iOS only)
   * @platform ios
   */
  enablePaging?: boolean;
  spacing?: number;

  // Zoom controls
  enableZoom?: boolean;
  minScale?: number;
  maxScale?: number;

  // Show default loading indicator
  showsActivityIndicator?: boolean;

  // Event handlers
  onLoadComplete?: (event: LoadCompleteEvent) => void;
  onPageChange?: (event: PageChangeEvent) => void;
  onScaleChange?: (event: ScaleChangeEvent) => void;
  onError?: (event: ErrorEvent) => void;
  onThumbnailGenerated?: (event: ThumbnailGeneratedEvent) => void;
  onLoadingChange?: (event: LoadingChangeEvent) => void;
}

export interface PdfViewerMethods extends HybridViewMethods {
  // Navigate to a specific page (0-indexed)
  goToPage(page: number): void;

  // Set zoom scale
  setScale(scale: number): void;

  // Generate thumbnail for specific page
  generateThumbnail(page: number): void;

  // Generate thumbnails for all pages
  generateAllThumbnails(): void;
}

export type PdfViewer = HybridView<PdfViewerProps, PdfViewerMethods>;
