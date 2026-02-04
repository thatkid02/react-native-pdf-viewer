import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StatusBar,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const SAMPLE_PDFS = [
  {
    id: '1',
    title: 'Neural Networks Research Paper',
    description: 'Advanced ML research from NeurIPS',
    url: 'https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf',
    color: '#6366f1',
  },
  {
    id: '2',
    title: 'Sample Document',
    description: 'Test PDF document',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    color: '#8b5cf6',
  },
  {
    id: '3',
    title: 'Technical Specification',
    description: 'PDF standard documentation',
    url: 'https://www.adobe.com/content/dam/acom/en/devnet/pdf/pdfs/PDF32000_2008.pdf',
    color: '#ec4899',
  },
];

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [customUrl, setCustomUrl] = useState('');

  const openPdf = (url: string, title: string) => {
    navigation.navigate('PdfViewer', { pdfUrl: url, title });
  };

  const openCustomPdf = () => {
    if (customUrl.trim()) {
      openPdf(customUrl.trim(), 'Custom PDF');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PDF Viewer</Text>
        <Text style={styles.headerSubtitle}>Select a document to view</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Custom URL Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Custom URL</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter PDF URL..."
              placeholderTextColor="#64748b"
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.openButton,
                !customUrl.trim() && styles.openButtonDisabled,
              ]}
              onPress={openCustomPdf}
              disabled={!customUrl.trim()}
            >
              <Text style={styles.openButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sample PDFs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sample Documents</Text>
          {SAMPLE_PDFS.map((pdf) => (
            <TouchableOpacity
              key={pdf.id}
              style={[styles.pdfCard, { borderLeftColor: pdf.color }]}
              onPress={() => openPdf(pdf.url, pdf.title)}
              activeOpacity={0.7}
            >
              <View style={styles.pdfCardContent}>
                <View style={[styles.pdfIcon, { backgroundColor: pdf.color }]}>
                  <Text style={styles.pdfIconText}>PDF</Text>
                </View>
                <View style={styles.pdfInfo}>
                  <Text style={styles.pdfTitle}>{pdf.title}</Text>
                  <Text style={styles.pdfDescription}>{pdf.description}</Text>
                </View>
                <View style={styles.chevron}>
                  <Text style={styles.chevronText}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featureGrid}>
            {[
              { icon: '🔍', title: 'Zoom & Pan', desc: 'Pinch to zoom' },
              {
                icon: '📄',
                title: 'Page Navigation',
                desc: 'Quick page jumps',
              },
              { icon: '🖼️', title: 'Thumbnails', desc: 'Visual preview' },
              {
                icon: '⚡',
                title: 'Fast Rendering',
                desc: 'Native performance',
              },
            ].map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <Text style={styles.featureIcon}>{feature.icon}</Text>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#334155',
  },
  openButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  openButtonDisabled: {
    backgroundColor: '#334155',
  },
  openButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pdfCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  pdfCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  pdfIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfIconText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  pdfInfo: {
    flex: 1,
    marginLeft: 16,
  },
  pdfTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  pdfDescription: {
    fontSize: 14,
    color: '#94a3b8',
  },
  chevron: {
    marginLeft: 8,
  },
  chevronText: {
    fontSize: 32,
    color: '#64748b',
    fontWeight: '300',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
    textAlign: 'center',
  },
  featureDesc: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
