import { getHostComponent } from 'react-native-nitro-modules';
const PdfViewerConfig = require('../nitrogen/generated/shared/json/PdfViewerConfig.json');
import type {
  PdfViewerMethods,
  PdfViewerProps,
} from './PdfViewer.nitro';

export const PdfViewerView = getHostComponent<
  PdfViewerProps,
  PdfViewerMethods
>('PdfViewer', () => PdfViewerConfig);
