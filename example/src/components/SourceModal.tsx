import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';

interface SourceModalProps {
  visible: boolean;
  tempSource: string;
  onSourceChange: (text: string) => void;
  onLoad: () => void;
  onCancel: () => void;
}

const EXAMPLE_PDFS = [
  {
    label: 'Neural Network Paper',
    icon: '🔬',
    url: 'https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf',
  },
  {
    label: 'Sample PDF Document',
    icon: '📝',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  },
];

export function SourceModal({
  visible,
  tempSource,
  onSourceChange,
  onLoad,
  onCancel,
}: SourceModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onCancel}
      >
        <TouchableOpacity
          style={styles.modalContent}
          activeOpacity={1}
          onPress={() => {}} // Prevent closing when tapping modal content
        >
          <View style={styles.modalHeader}>
            <View style={styles.headerIconWrapper}>
              <Text style={styles.headerIcon}>📂</Text>
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.modalTitle}>Load PDF Document</Text>
              <Text style={styles.modalSubtitle}>
                Enter a URL or select an example
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.modalLabel}>PDF SOURCE</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.modalInput}
                value={tempSource}
                onChangeText={onSourceChange}
                placeholder="https://example.com/document.pdf"
                placeholderTextColor="#636366"
                multiline
                autoFocus
              />
            </View>
          </View>

          <View style={styles.exampleSection}>
            <Text style={styles.modalLabel}>QUICK EXAMPLES</Text>
            <ScrollView
              style={styles.exampleList}
              showsVerticalScrollIndicator={false}
            >
              {EXAMPLE_PDFS.map((example, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.exampleItem}
                  onPress={() => onSourceChange(example.url)}
                >
                  <View style={styles.exampleIconWrapper}>
                    <Text style={styles.exampleIcon}>{example.icon}</Text>
                  </View>
                  <Text style={styles.exampleText}>{example.label}</Text>
                  <Text style={styles.exampleArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonCancel]}
              onPress={onCancel}
            >
              <Text style={styles.modalButtonTextCancel}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonLoad]}
              onPress={onLoad}
            >
              <Text style={styles.modalButtonTextLoad}>Load PDF</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  headerIcon: {
    fontSize: 32,
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(48, 48, 52, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  inputSection: {
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 8,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    backgroundColor: 'rgba(48, 48, 52, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalInput: {
    padding: 16,
    fontSize: 15,
    color: '#ffffff',
    minHeight: 100,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  exampleSection: {
    marginBottom: 24,
  },
  exampleList: {
    maxHeight: 180,
  },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(48, 48, 52, 0.6)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  exampleIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exampleIcon: {
    fontSize: 20,
  },
  exampleText: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  exampleArrow: {
    fontSize: 24,
    color: '#636366',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(48, 48, 52, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButtonLoad: {
    backgroundColor: '#0A84FF',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalButtonTextLoad: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
