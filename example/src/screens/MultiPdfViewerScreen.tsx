import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Text,
  ScrollView,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  PdfViewerView,
  callback,
  type LoadCompleteEvent,
  type PageChangeEvent,
  type ScaleChangeEvent,
  type ErrorEvent,
  type ThumbnailGeneratedEvent,
  type LoadingChangeEvent,
  type PdfViewerRef,
} from '@thatkid02/react-native-pdf-viewer';
import type { RootStackParamList } from '../navigation/types';

type MultiPdfViewerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MultiPdfViewer'>;
};

interface PdfFile {
  id: string;
  title: string;
  url: string;
  color: string;
}

const PDF_FILES: PdfFile[] = [
  {
    id: '1',
    title: 'Neural Networks',
    url: 'https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf',
    color: '#6366f1',
  },
  {
    id: '2',
    title: 'Sample PDF',
    url: 'https://files.eric.ed.gov/fulltext/EJ1172284.pdf',
    color: '#8b5cf6',
  },
  {
    id: '3',
    title: 'Technical Spec',
    url: 'https://www.amherst.edu/system/files/media/0759/Brown-Giving-PsychSci-2003.pdf',
    color: '#ec4899',
  },
  {
    id: '4',
    title: 'Research Paper',
    url: 'https://arxiv.org/pdf/2301.00001.pdf',
    color: '#f59e0b',
  },
  {
    id: '5',
    title: 'Documentation',
    url: 'https://scert.delhi.gov.in/sites/default/files/SCERT/research_project_report.pdf',
    color: '#10b981',
  },
];

export default function MultiPdfViewerScreen({
  navigation,
}: MultiPdfViewerScreenProps) {
  const pdfRef = useRef<PdfViewerRef | null>(null);
  const thumbnailRefs = useRef<Map<string, PdfViewerRef | null>>(new Map());
  const [selectedPdfId, setSelectedPdfId] = useState<string>('1');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const thumbnailScrollRef = useRef<ScrollView>(null);
  const [pdfThumbnails, setPdfThumbnails] = useState<Map<string, string>>(
    new Map()
  );
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(
    new Set()
  );

  const selectedPdf = useMemo(
    () => PDF_FILES.find((pdf) => pdf.id === selectedPdfId) || PDF_FILES[0],
    [selectedPdfId]
  );

  const minScale = 0.5;
  const maxScale = 4.0;
  const zoomStep = 0.5;

  const toggleControls = useCallback(() => {
    const toValue = controlsVisible ? 0 : 1;
    setControlsVisible(!controlsVisible);
    Animated.timing(controlsOpacity, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, controlsOpacity]);

  const handleLoadComplete = useCallback(
    (event: LoadCompleteEvent) => {
      console.log('✅ PDF Loaded:', selectedPdf?.title);
      setTotalPages(event.pageCount);
      setCurrentPage(1);
      setCurrentScale(1.0);

      // Generate thumbnail for the selected PDF from main viewer
      if (event.pageCount > 0 && selectedPdf) {
        setTimeout(() => {
          // Generate first page thumbnail for the carousel
          try {
            pdfRef.current?.generateThumbnail(0);
          } catch (error) {
            console.error('Error generating main thumbnail:', error);
          }

          // Auto-generate thumbnails for page navigation
          const pagesToGenerate = Math.min(10, event.pageCount);
          for (let i = 1; i < pagesToGenerate; i++) {
            try {
              pdfRef.current?.generateThumbnail(i);
            } catch {
              // Silently fail
            }
          }
        }, 500);
      }
    },
    [selectedPdf]
  );

  const handlePageChange = useCallback((event: PageChangeEvent) => {
    setCurrentPage(event.page + 1);
  }, []);

  const handleScaleChange = useCallback((event: ScaleChangeEvent) => {
    setCurrentScale(event.scale);
  }, []);

  const handleError = useCallback((event: ErrorEvent) => {
    console.error('❌ Error:', event.message, event.code);
  }, []);

  const handleThumbnailGenerated = useCallback(
    (event: ThumbnailGeneratedEvent) => {
      // Store thumbnail from main viewer for the selected PDF
      if (event.page === 0 && selectedPdf) {
        setPdfThumbnails((prev) => {
          const updated = new Map(prev);
          updated.set(selectedPdf.id, event.uri);
          return updated;
        });
        setLoadingThumbnails((prev) => {
          const updated = new Set(prev);
          updated.delete(selectedPdf.id);
          return updated;
        });
      }
    },
    [selectedPdf]
  );

  const handleLoadingChange = useCallback((event: LoadingChangeEvent) => {
    setIsLoading(event.isLoading);
  }, []);

  const resetZoom = useCallback(() => {
    pdfRef.current?.setScale(1.0);
  }, []);

  const zoomIn = useCallback(() => {
    const newScale = Math.min(currentScale + zoomStep, maxScale);
    pdfRef.current?.setScale(newScale);
  }, [currentScale, maxScale, zoomStep]);

  const zoomOut = useCallback(() => {
    const newScale = Math.max(currentScale - zoomStep, minScale);
    pdfRef.current?.setScale(newScale);
  }, [currentScale, minScale, zoomStep]);

  const handleSelectPdf = useCallback((pdfId: string) => {
    setSelectedPdfId(pdfId);
    setCurrentPage(1);
    setTotalPages(0);
    setCurrentScale(1.0);
  }, []);

  // Generate thumbnails for PDF files in the carousel
  const handlePdfThumbnailGenerated = useCallback(
    (pdfId: string) => (event: ThumbnailGeneratedEvent) => {
      if (event.page === 0) {
        setPdfThumbnails((prev) => {
          const updated = new Map(prev);
          updated.set(pdfId, event.uri);
          return updated;
        });
        setLoadingThumbnails((prev) => {
          const updated = new Set(prev);
          updated.delete(pdfId);
          return updated;
        });
      }
    },
    []
  );

  const handlePdfThumbnailLoadComplete = useCallback(
    (pdfId: string) => (_event: LoadCompleteEvent) => {
      // Request thumbnail for first page only after PDF is loaded
      setTimeout(() => {
        const ref = thumbnailRefs.current.get(pdfId);
        if (ref && typeof ref.generateThumbnail === 'function') {
          try {
            ref.generateThumbnail(0);
          } catch (error) {
            console.error('Error generating thumbnail for', pdfId, error);
            setLoadingThumbnails((prev) => {
              const updated = new Set(prev);
              updated.delete(pdfId);
              return updated;
            });
          }
        }
      }, 200);
    },
    []
  );

  // Generate thumbnails when component mounts
  useEffect(() => {
    // Mark all PDFs as loading thumbnails
    setLoadingThumbnails(new Set(PDF_FILES.map((pdf) => pdf.id)));
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>
            {selectedPdf?.title || 'PDF Viewer'}
          </Text>
          <Text style={styles.headerSubtitle}>
            Page {currentPage} of {totalPages}
          </Text>
        </View>
      </View>

      {/* Main PDF Viewer */}
      <View style={styles.viewerContainer}>
        {selectedPdf && (
          <PdfViewerView
            hybridRef={callback((ref: PdfViewerRef | null) => {
              pdfRef.current = ref;
            })}
            source={selectedPdf.url}
            spacing={8}
            enableZoom={true}
            minScale={minScale}
            maxScale={maxScale}
            showsActivityIndicator={true}
            onLoadComplete={callback(handleLoadComplete)}
            onPageChange={callback(handlePageChange)}
            onScaleChange={callback(handleScaleChange)}
            onError={callback(handleError)}
            onThumbnailGenerated={callback(handleThumbnailGenerated)}
            onLoadingChange={callback(handleLoadingChange)}
            style={styles.pdfView}
          />
        )}

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        )}
      </View>

      {/* Zoom Controls */}
      <Animated.View
        style={[
          styles.controlsContainer,
          { opacity: controlsOpacity },
          controlsVisible ? styles.controlsVisible : styles.controlsHidden,
        ]}
      >
        <View style={styles.zoomControls}>
          <TouchableOpacity
            style={[styles.button, styles.zoomButton]}
            onPress={zoomOut}
            disabled={currentScale <= minScale}
          >
            <Text style={styles.buttonText}>−</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.zoomButton]}
            onPress={resetZoom}
          >
            <Text style={styles.buttonText}>1x</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.zoomButton]}
            onPress={zoomIn}
            disabled={currentScale >= maxScale}
          >
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>

          <View style={styles.zoomDisplayBadge}>
            <Text style={styles.zoomDisplayText}>
              {currentScale.toFixed(1)}x
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.toggleButton]}
          onPress={toggleControls}
        >
          <Text style={styles.buttonText}>⌄</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* PDF File Thumbnails - Horizontal Scroll */}
      <View style={styles.thumbnailSection}>
        <Text style={styles.thumbnailLabel}>Files</Text>
        <ScrollView
          ref={thumbnailScrollRef as any}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailContainer}
          scrollEventThrottle={16}
        >
          {PDF_FILES.map((pdf) => {
            const thumbnailUri = pdfThumbnails.get(pdf.id);
            const isLoadingThumb = loadingThumbnails.has(pdf.id);

            return (
              <View key={pdf.id} style={styles.thumbnailItemWrapper}>
                <TouchableOpacity
                  style={[
                    styles.thumbnailItem,
                    selectedPdfId === pdf.id && styles.selectedThumbnail,
                  ]}
                  onPress={() => handleSelectPdf(pdf.id)}
                >
                  <View
                    style={[
                      styles.thumbnailPlaceholder,
                      selectedPdfId === pdf.id
                        ? styles.selectedPlaceholder
                        : styles.deselectedPlaceholder,
                    ]}
                  >
                    {thumbnailUri ? (
                      <Image
                        source={{ uri: thumbnailUri }}
                        style={styles.thumbnailImage}
                        resizeMode="cover"
                      />
                    ) : isLoadingThumb ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.placeholderText}>📄</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.thumbnailTitle,
                      selectedPdfId === pdf.id && styles.selectedThumbnailTitle,
                    ]}
                    numberOfLines={2}
                  >
                    {pdf.title}
                  </Text>
                </TouchableOpacity>

                {/* Hidden PdfViewer for thumbnail generation - only for non-selected PDFs */}
                {selectedPdfId !== pdf.id && (
                  <View style={styles.hiddenPdfContainer}>
                    <PdfViewerView
                      hybridRef={callback((ref: PdfViewerRef | null) => {
                        if (ref) {
                          thumbnailRefs.current.set(pdf.id, ref);
                        } else {
                          thumbnailRefs.current.delete(pdf.id);
                        }
                      })}
                      source={pdf.url}
                      showsActivityIndicator={false}
                      onLoadComplete={callback(
                        handlePdfThumbnailLoadComplete(pdf.id)
                      )}
                      onThumbnailGenerated={callback(
                        handlePdfThumbnailGenerated(pdf.id)
                      )}
                      onError={callback((event: ErrorEvent) => {
                        console.error(
                          'Error loading PDF for thumbnail:',
                          pdf.id,
                          event.message
                        );
                        setLoadingThumbnails((prev) => {
                          const updated = new Set(prev);
                          updated.delete(pdf.id);
                          return updated;
                        });
                      })}
                      style={styles.hiddenPdf}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
  pdfView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  controlsVisible: {
    pointerEvents: 'auto' as const,
  },
  controlsHidden: {
    pointerEvents: 'none' as const,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButton: {
    width: 40,
    height: 40,
  },
  buttonText: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  zoomDisplayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#6366f1',
    borderRadius: 6,
    marginLeft: 8,
  },
  zoomDisplayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  thumbnailSection: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: 160,
  },
  thumbnailLabel: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  thumbnailContainer: {
    paddingHorizontal: 16,
    gap: 12,
    paddingRight: 20,
  },
  thumbnailItemWrapper: {
    position: 'relative',
  },
  thumbnailItem: {
    alignItems: 'center',
    width: 100,
  },
  selectedThumbnail: {
    opacity: 1,
  },
  thumbnailPlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#334155',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  selectedPlaceholder: {
    borderColor: '#fff',
    opacity: 1,
  },
  deselectedPlaceholder: {
    opacity: 0.7,
  },
  placeholderText: {
    fontSize: 32,
  },
  thumbnailTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  selectedThumbnailTitle: {
    color: '#6366f1',
    fontWeight: '700',
  },
  hiddenPdfContainer: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenPdf: {
    width: 1,
    height: 1,
  },
});
