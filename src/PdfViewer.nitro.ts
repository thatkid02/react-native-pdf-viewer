import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules';

export interface PdfViewerProps extends HybridViewProps {
  color: string;
}
export interface PdfViewerMethods extends HybridViewMethods {}

export type PdfViewer = HybridView<
  PdfViewerProps,
  PdfViewerMethods
>;
