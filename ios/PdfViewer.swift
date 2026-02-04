import Foundation
import PDFKit
import NitroModules
import CryptoKit

//  Error Types
enum PdfViewerError: LocalizedError {
  case documentNotLoaded
  case invalidPageIndex(page: Int, pageCount: Int)
  case zoomDisabled
  case invalidSource
  case invalidUri
  case unsupportedScheme(String)
  case fileNotFound(String)
  case fileNotReadable(String)
  case parseFailed
  case passwordProtected
  case emptyPdf
  case networkError(Error)
  case httpError(Int)
  case emptyResponse
  case thumbnailSaveFailed
  
  var errorDescription: String? {
    switch self {
    case .documentNotLoaded: return "Document not loaded"
    case .invalidPageIndex(let page, let count): return "Invalid page index \(page), document has \(count) pages"
    case .zoomDisabled: return "Zoom is disabled"
    case .invalidSource: return "Invalid source URI"
    case .invalidUri: return "Could not parse source URI"
    case .unsupportedScheme(let scheme): return "Unsupported URI scheme: \(scheme)"
    case .fileNotFound(let path): return "File not found: \(path)"
    case .fileNotReadable(let path): return "File is not readable: \(path)"
    case .parseFailed: return "Failed to parse PDF"
    case .passwordProtected: return "PDF is password protected"
    case .emptyPdf: return "PDF has no pages"
    case .networkError(let error): return "Network error: \(error.localizedDescription)"
    case .httpError(let code): return "HTTP error: \(code)"
    case .emptyResponse: return "Empty response"
    case .thumbnailSaveFailed: return "Failed to save thumbnail"
    }
  }
  
  var errorCode: String {
    switch self {
    case .documentNotLoaded: return "DOCUMENT_NOT_LOADED"
    case .invalidPageIndex: return "INVALID_PAGE_INDEX"
    case .zoomDisabled: return "ZOOM_DISABLED"
    case .invalidSource: return "INVALID_SOURCE"
    case .invalidUri: return "INVALID_URI"
    case .unsupportedScheme: return "UNSUPPORTED_SCHEME"
    case .fileNotFound: return "FILE_NOT_FOUND"
    case .fileNotReadable: return "FILE_NOT_READABLE"
    case .parseFailed: return "PARSE_FAILED"
    case .passwordProtected: return "PASSWORD_PROTECTED"
    case .emptyPdf: return "EMPTY_PDF"
    case .networkError: return "NETWORK_ERROR"
    case .httpError: return "HTTP_ERROR"
    case .emptyResponse: return "EMPTY_RESPONSE"
    case .thumbnailSaveFailed: return "THUMBNAIL_SAVE_ERROR"
    }
  }
}

class HybridPdfViewer: HybridPdfViewerSpec {
  //  Properties
  private var containerView: UIView!
  private var pdfView: PDFView!
  private var activityIndicator: UIActivityIndicatorView!
  private var document: PDFDocument?
  private var sourceUri: String?
  private var documentHash: String?  // MD5 hash of source URI for caching
  private var urlSession: URLSession!
  private var downloadTask: URLSessionDataTask?
  private var loadToken: Int = 0
  private var boundsObservation: NSKeyValueObservation?
  private var backgroundObserver: NSObjectProtocol?
  private var isLoading: Bool = false {
    didSet {
      if isLoading != oldValue {
        updateActivityIndicator()
        onLoadingChange?(LoadingChangeEvent(isLoading: isLoading))
      }
    }
  }
  
  // URL-scoped thumbnail cache: document hash -> page index -> URI
  private var thumbnailCache = [String: [Int: String]]()
  private let cacheLock = NSLock()
  
  // Dedicated queue for thumbnail generation with limited concurrency
  private let thumbnailQueue = DispatchQueue(label: "com.pdfviewer.thumbnails", qos: .utility, attributes: .concurrent)
  private let thumbnailSemaphore = DispatchSemaphore(value: 4)  // Max 4 concurrent thumbnail generations
  
  // Track if we're currently generating thumbnails to avoid duplicate work
  private var pendingThumbnails = Set<Int>()
  private let pendingLock = NSLock()
  
  // Nitro View
  var view: UIView {
    return containerView
  }
  
  //  Nitro Properties
  var source: String? {
    didSet {
      if source != oldValue {
        loadDocument(source)
      }
    }
  }
  
  var horizontal: Bool? {
    didSet {
      guard let horizontal = horizontal else { return }
      ensureMainThread {
        self.pdfView.displayDirection = horizontal ? .horizontal : .vertical
      }
    }
  }
  
  var enablePaging: Bool? {
    didSet {
      guard let enablePaging = enablePaging else { return }
      ensureMainThread {
        self.pdfView.displayMode = enablePaging ? .singlePage : .singlePageContinuous
        self.pdfView.usePageViewController(enablePaging, withViewOptions: nil)
        // Ensure autoScales is enabled for proper width fitting in both modes
        self.pdfView.autoScales = true
      }
    }
  }
  
  var spacing: Double? {
    didSet {
      guard let spacing = spacing else { return }
      ensureMainThread {
        if spacing > 0 {
          self.pdfView.displaysPageBreaks = true
          self.pdfView.pageBreakMargins = UIEdgeInsets(top: CGFloat(spacing), left: 0, bottom: CGFloat(spacing), right: 0)
        } else {
          self.pdfView.displaysPageBreaks = false
        }
      }
    }
  }
  
  // Content insets for glass UI / transparent bars
  var contentInsetTop: Double? {
    didSet {
      updateContentInsets()
    }
  }
  
  var contentInsetBottom: Double? {
    didSet {
      updateContentInsets()
    }
  }
  
  var contentInsetLeft: Double? {
    didSet {
      updateContentInsets()
    }
  }
  
  var contentInsetRight: Double? {
    didSet {
      updateContentInsets()
    }
  }
  
  private func updateContentInsets() {
    ensureMainThread {
      // Get scroll view from PDFView's view hierarchy
      // PDFView uses PDFDocumentView which contains a scroll view
      if let scrollView = self.findScrollView(in: self.pdfView) {
        let insets = UIEdgeInsets(
          top: CGFloat(self.contentInsetTop ?? 0),
          left: CGFloat(self.contentInsetLeft ?? 0),
          bottom: CGFloat(self.contentInsetBottom ?? 0),
          right: CGFloat(self.contentInsetRight ?? 0)
        )
        scrollView.contentInset = insets
        // Adjust scroll indicator insets to match
        scrollView.scrollIndicatorInsets = insets
      }
    }
  }
  
  private func findScrollView(in view: UIView) -> UIScrollView? {
    if let scrollView = view as? UIScrollView {
      return scrollView
    }
    for subview in view.subviews {
      if let scrollView = findScrollView(in: subview) {
        return scrollView
      }
    }
    return nil
  }
  
  var enableZoom: Bool? {
    didSet {
      guard let enableZoom = enableZoom else { return }
      ensureMainThread {
        if !enableZoom {
          self.pdfView.minScaleFactor = 1.0
          self.pdfView.maxScaleFactor = 1.0
          self.pdfView.scaleFactor = 1.0
        } else {
          self.pdfView.minScaleFactor = CGFloat(self.minScale ?? 0.5)
          self.pdfView.maxScaleFactor = CGFloat(self.maxScale ?? 4.0)
        }
        // PDFView's built-in gestures handle zoom when scale factors allow it
        // No need to disable isUserInteractionEnabled as it affects scrolling too
      }
    }
  }
  
  var minScale: Double? {
    didSet {
      if let minScale = minScale, enableZoom ?? true {
        ensureMainThread {
          self.pdfView.minScaleFactor = CGFloat(minScale)
        }
      }
    }
  }
  
  var maxScale: Double? {
    didSet {
      if let maxScale = maxScale, enableZoom ?? true {
        ensureMainThread {
          self.pdfView.maxScaleFactor = CGFloat(maxScale)
        }
      }
    }
  }
  
  // Event callbacks
  var onLoadComplete: ((LoadCompleteEvent) -> Void)?
  var onPageChange: ((PageChangeEvent) -> Void)?
  var onScaleChange: ((ScaleChangeEvent) -> Void)?
  var onError: ((ErrorEvent) -> Void)?
  var onThumbnailGenerated: ((ThumbnailGeneratedEvent) -> Void)?
  var onLoadingChange: ((LoadingChangeEvent) -> Void)?
  
  // Show/hide activity indicator
  var showsActivityIndicator: Bool? {
    didSet {
      ensureMainThread {
        self.updateActivityIndicator()
      }
    }
  }
  
  //  Activity Indicator
  private func updateActivityIndicator() {
    // Ensure we're on main thread for UI updates
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in
        self?.updateActivityIndicator()
      }
      return
    }
    
    let shouldShow = isLoading && (showsActivityIndicator ?? true)
    if shouldShow {
      activityIndicator.startAnimating()
    } else {
      activityIndicator.stopAnimating()
    }
  }
  
  //  Initialization
  override init() {
    // Create container view
    containerView = UIView()
    containerView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    containerView.backgroundColor = .white
    
    // Create PDF view
    pdfView = PDFView()
    pdfView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    pdfView.autoScales = true  // Enable autoScales to fit width by default
    pdfView.displayDirection = .vertical
    pdfView.displayMode = .singlePageContinuous
    pdfView.usePageViewController(false, withViewOptions: nil)
    pdfView.displaysPageBreaks = false
    pdfView.minScaleFactor = 0.5
    pdfView.maxScaleFactor = 4.0
    pdfView.backgroundColor = .white
    
    // Enable user interaction for gestures (pinch zoom, pan, etc.)
    pdfView.isUserInteractionEnabled = true
    
    // PDFView has built-in gesture recognizers for pinch zoom
    // No need to add custom gesture recognizers
    containerView.addSubview(pdfView)
    
    // Create activity indicator
    activityIndicator = UIActivityIndicatorView(style: .large)
    activityIndicator.hidesWhenStopped = true
    activityIndicator.color = .gray
    activityIndicator.translatesAutoresizingMaskIntoConstraints = false
    containerView.addSubview(activityIndicator)
    
    // Center activity indicator
    NSLayoutConstraint.activate([
      activityIndicator.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
      activityIndicator.centerYAnchor.constraint(equalTo: containerView.centerYAnchor)
    ])
    
    // Use default configuration with caching enabled for better performance
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30.0
    config.requestCachePolicy = .returnCacheDataElseLoad
    config.urlCache = URLCache.shared
    urlSession = URLSession(configuration: config)
    
    super.init()
    
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(pageChanged),
      name: .PDFViewPageChanged,
      object: pdfView
    )
    
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(scaleChanged),
      name: .PDFViewScaleChanged,
      object: pdfView
    )
    
    // Observe memory warnings to clear caches
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didReceiveMemoryWarning),
      name: UIApplication.didReceiveMemoryWarningNotification,
      object: nil
    )
    
    // Observe app entering background to cleanup thumbnail cache
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.cleanupThumbnailDirectory()
    }
    
    // Observe bounds changes to update scale factor when view is resized
    boundsObservation = pdfView.observe(\.bounds, options: [.new]) { [weak self] _, _ in
      guard let self = self else { return }
      // Only re-enable autoScales during bounds change if we're at default scale
      // This allows manual zoom to persist through view lifecycle changes
      if self.pdfView.displayMode == .singlePageContinuous && self.pdfView.scaleFactor == 1.0 {
        self.pdfView.autoScales = true
      }
      self.updateScaleToFitWidthIfNeeded()
    }
  }
  
  deinit {
    NotificationCenter.default.removeObserver(self)
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    boundsObservation?.invalidate()
    downloadTask?.cancel()
    urlSession.invalidateAndCancel()
    
    // Clear in-memory cache for this document only (disk cache persists)
    if let hash = documentHash {
      cacheLock.lock()
      thumbnailCache.removeValue(forKey: hash)
      cacheLock.unlock()
    }
  }
  
  //  Document Loading
  private func loadDocument(_ source: String?) {
    loadToken += 1
    let currentToken = loadToken
    downloadTask?.cancel()
    downloadTask = nil
    document = nil
    pdfView.document = nil
    
    // Clear pending thumbnail operations
    pendingLock.lock()
    pendingThumbnails.removeAll()
    pendingLock.unlock()
    
    // Set loading state
    ensureMainThread {
      self.isLoading = true
    }
    
    guard let source = source, !source.isEmpty else {
      ensureMainThread { self.isLoading = false }
      emitError(.invalidSource)
      return
    }
    
    // Store the source URI for thumbnail caching
    sourceUri = source
    documentHash = computeDocumentHash(source)
    
    guard let url = resolveURL(from: source) else {
      ensureMainThread { self.isLoading = false }
      emitError(.invalidUri)
      return
    }
    
    let scheme = url.scheme ?? ""
    guard url.isFileURL || scheme == "http" || scheme == "https" else {
      ensureMainThread { self.isLoading = false }
      emitError(.unsupportedScheme(scheme))
      return
    }
    
    if url.isFileURL {
      loadLocalDocument(url: url, token: currentToken)
    } else {
      loadRemoteDocument(url: url, token: currentToken)
    }
  }
  
  private func loadLocalDocument(url: URL, token: Int) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self, token == self.loadToken else { return }
      
      let fileManager = FileManager.default
      let path = url.path
      
      guard fileManager.fileExists(atPath: path) else {
        self.emitErrorOnMain(.fileNotFound(path))
        return
      }
      
      guard fileManager.isReadableFile(atPath: path) else {
        self.emitErrorOnMain(.fileNotReadable(path))
        return
      }
      
      guard let document = PDFDocument(url: url) else {
        self.emitErrorOnMain(.parseFailed)
        return
      }
      
      DispatchQueue.main.async { [weak self] in
        guard let self = self, token == self.loadToken else { return }
        self.applyLoadedDocument(document)
      }
    }
  }
  
  private func loadRemoteDocument(url: URL, token: Int) {
    let request = URLRequest(url: url, timeoutInterval: 30.0)
    
    downloadTask = urlSession.dataTask(with: request) { [weak self] data, response, error in
      guard let self = self, token == self.loadToken else { return }
      
      if let error = error as NSError? {
        // Check if cancelled
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled {
          return
        }
        self.emitErrorOnMain(.networkError(error))
        return
      }
      
      if let httpResponse = response as? HTTPURLResponse,
         !(200...299).contains(httpResponse.statusCode) {
        self.emitErrorOnMain(.httpError(httpResponse.statusCode))
        return
      }
      
      guard let data = data, !data.isEmpty else {
        self.emitErrorOnMain(.emptyResponse)
        return
      }
      
      guard let document = PDFDocument(data: data) else {
        self.emitErrorOnMain(.parseFailed)
        return
      }
      
      DispatchQueue.main.async { [weak self] in
        guard let self = self, token == self.loadToken else { return }
        self.applyLoadedDocument(document)
      }
    }
    downloadTask?.resume()
  }
  
  private func applyLoadedDocument(_ document: PDFDocument) {
    guard !document.isLocked else {
      isLoading = false
      emitError(.passwordProtected)
      return
    }
    
    guard document.pageCount > 0 else {
      isLoading = false
      emitError(.emptyPdf)
      return
    }
    
    isLoading = false
    self.document = document
    pdfView.document = document
    
    // Clear in-memory cache for all documents
    cacheLock.lock()
    thumbnailCache.removeAll()
    cacheLock.unlock()
    
    // Ensure autoScales is enabled for proper width fitting
    pdfView.autoScales = true
    
    // Update scale after document is loaded
    updateScaleToFitWidthIfNeeded()
    
    // If bounds were zero, schedule a delayed update
    if pdfView.bounds.width == 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
        self?.updateScaleToFitWidthIfNeeded()
      }
    }
    
    if let firstPage = document.page(at: 0) {
      let pageRect = firstPage.bounds(for: .mediaBox)
      onLoadComplete?(LoadCompleteEvent(
        pageCount: Double(document.pageCount),
        pageWidth: Double(pageRect.width),
        pageHeight: Double(pageRect.height)
      ))
    }
  }
  
  private func updateScaleToFitWidthIfNeeded() {
    guard let document = document, document.pageCount > 0,
          let firstPage = document.page(at: 0) else { return }
    
    let pageRect = firstPage.bounds(for: .mediaBox)
    let viewWidth = pdfView.bounds.width
    
    // Only update scale if view has been laid out (width > 0)
    guard viewWidth > 0 && pageRect.width > 0 else { return }
    
    // In continuous scroll mode, check if we should enable autoScales
    if pdfView.displayMode == .singlePageContinuous {
      // Only enable autoScales if at default scale (hasn't been manually zoomed)
      // This preserves user's manual zoom level through view lifecycle
      let currentScale = pdfView.scaleFactor
      let isDefaultScale = abs(currentScale - 1.0) < 0.01
      
      if isDefaultScale {
        pdfView.autoScales = true
        // Force PDFView to recalculate scale if needed
        pdfView.layoutDocumentView()
      }
    } else {
      // For paging mode, calculate and set the scale to fit width
      let scale = viewWidth / pageRect.width
      let minScale = CGFloat(self.minScale ?? 0.5)
      let maxScale = CGFloat(self.maxScale ?? 4.0)
      
      // Clamp the scale between min and max
      let clampedScale = max(minScale, min(maxScale, scale))
      pdfView.scaleFactor = clampedScale
    }
  }
  
  private func resolveURL(from source: String) -> URL? {
    if let url = URL(string: source), url.scheme != nil {
      return url
    }
    return URL(fileURLWithPath: source)
  }
  
  //  Notifications
  @objc private func pageChanged() {
    guard let document = document, let currentPage = pdfView.currentPage else { return }
    let pageIndex = document.index(for: currentPage)
    
    onPageChange?(PageChangeEvent(
      page: Double(pageIndex),
      pageCount: Double(document.pageCount)
    ))
  }
  
  @objc private func scaleChanged() {
    onScaleChange?(ScaleChangeEvent(scale: Double(pdfView.scaleFactor)))
  }
  
  @objc private func didReceiveMemoryWarning() {
    // Clear thumbnail cache to free up memory
    cacheLock.lock()
    thumbnailCache.removeAll()
    cacheLock.unlock()
    
    // Clear pending thumbnails set
    pendingLock.lock()
    pendingThumbnails.removeAll()
    pendingLock.unlock()
  }
  
  //  Nitro Methods
  func goToPage(page: Double) throws {
    guard let document = document else {
      throw PdfViewerError.documentNotLoaded
    }
    
    let pageIndex = Int(page)
    guard pageIndex >= 0 && pageIndex < document.pageCount else {
      throw PdfViewerError.invalidPageIndex(page: pageIndex, pageCount: document.pageCount)
    }
    
    guard let pdfPage = document.page(at: pageIndex) else {
      throw PdfViewerError.invalidPageIndex(page: pageIndex, pageCount: document.pageCount)
    }
    
    // Ensure UI update happens on main thread
    if Thread.isMainThread {
      pdfView.go(to: pdfPage)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.pdfView.go(to: pdfPage)
      }
    }
  }
  
  func setScale(scale: Double) throws {
    guard enableZoom ?? true else {
      throw PdfViewerError.zoomDisabled
    }
    
    let minScale = CGFloat(self.minScale ?? 0.5)
    let maxScale = CGFloat(self.maxScale ?? 4.0)
    let clampedScale = max(minScale, min(maxScale, CGFloat(scale)))
    
    // Disable autoScales when manually setting scale
    // This allows programmatic zoom control to work
    ensureMainThread {
      self.pdfView.autoScales = false
      self.pdfView.scaleFactor = clampedScale
    }
  }
  
  func generateThumbnail(page: Double) throws {
    guard let document = document else {
      throw PdfViewerError.documentNotLoaded
    }
    
    guard let hash = documentHash else {
      throw PdfViewerError.invalidSource
    }
    
    let pageIndex = Int(page)
    guard pageIndex >= 0 && pageIndex < document.pageCount else {
      throw PdfViewerError.invalidPageIndex(page: pageIndex, pageCount: document.pageCount)
    }
    
    // Check in-memory cache first
    cacheLock.lock()
    if let cachedUri = thumbnailCache[hash]?[pageIndex] {
      cacheLock.unlock()
      onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: cachedUri))
      return
    }
    cacheLock.unlock()
    
    // Check disk cache before generating
    let diskPath = getThumbnailPath(hash: hash, page: pageIndex)
    if FileManager.default.fileExists(atPath: diskPath.path) {
      let uri = diskPath.absoluteString
      // Cache in memory
      cacheLock.lock()
      if thumbnailCache[hash] == nil {
        thumbnailCache[hash] = [:]
      }
      thumbnailCache[hash]?[pageIndex] = uri
      cacheLock.unlock()
      
      onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: uri))
      return
    }
    
    // Check if already being generated
    pendingLock.lock()
    if pendingThumbnails.contains(pageIndex) {
      pendingLock.unlock()
      return  // Already in progress
    }
    pendingThumbnails.insert(pageIndex)
    pendingLock.unlock()
    
    // Generate thumbnail asynchronously with semaphore for concurrency control
    thumbnailQueue.async { [weak self] in
      guard let self = self else { return }
      
      defer {
        self.pendingLock.lock()
        self.pendingThumbnails.remove(pageIndex)
        self.pendingLock.unlock()
      }
      
      self.thumbnailSemaphore.wait()
      defer { self.thumbnailSemaphore.signal() }
      
      // Double-check disk cache after acquiring semaphore
      if FileManager.default.fileExists(atPath: diskPath.path) {
        let uri = diskPath.absoluteString
        self.cacheLock.lock()
        if self.thumbnailCache[hash] == nil {
          self.thumbnailCache[hash] = [:]
        }
        self.thumbnailCache[hash]?[pageIndex] = uri
        self.cacheLock.unlock()
        
        DispatchQueue.main.async { [weak self] in
          self?.onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: uri))
        }
        return
      }
      
      self.generateThumbnailSync(document: document, pageIndex: pageIndex, hash: hash)
    }
  }
  
  func generateAllThumbnails() throws {
    guard let document = document else {
      throw PdfViewerError.documentNotLoaded
    }
    
    guard let hash = documentHash else {
      throw PdfViewerError.invalidSource
    }
    
    let pageCount = document.pageCount
    
    // Process thumbnails in batches for better memory management
    thumbnailQueue.async { [weak self] in
      guard let self = self else { return }
      
      for pageIndex in 0..<pageCount {
        autoreleasepool {
          // Check in-memory cache
          self.cacheLock.lock()
          if let cachedUri = self.thumbnailCache[hash]?[pageIndex] {
            self.cacheLock.unlock()
            DispatchQueue.main.async { [weak self] in
              self?.onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: cachedUri))
            }
            return
          }
          self.cacheLock.unlock()
          
          // Check disk cache
          let diskPath = self.getThumbnailPath(hash: hash, page: pageIndex)
          if FileManager.default.fileExists(atPath: diskPath.path) {
            let uri = diskPath.absoluteString
            self.cacheLock.lock()
            if self.thumbnailCache[hash] == nil {
              self.thumbnailCache[hash] = [:]
            }
            self.thumbnailCache[hash]?[pageIndex] = uri
            self.cacheLock.unlock()
            
            DispatchQueue.main.async { [weak self] in
              self?.onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: uri))
            }
            return
          }
          
          self.thumbnailSemaphore.wait()
          defer { self.thumbnailSemaphore.signal() }
          
          self.generateThumbnailSync(document: document, pageIndex: pageIndex, hash: hash)
        }
      }
    }
  }
  
  func getDocumentInfo() throws -> DocumentInfo? {
    guard let document = document else {
      return nil
    }
    
    guard let firstPage = document.page(at: 0) else {
      return nil
    }
    
    // Get current page index
    var currentPageIndex = 0
    if let currentPage = pdfView.currentPage {
      currentPageIndex = document.index(for: currentPage)
    }
    
    let bounds = firstPage.bounds(for: .mediaBox)
    return DocumentInfo(
      pageCount: Double(document.pageCount),
      pageWidth: bounds.width,
      pageHeight: bounds.height,
      currentPage: Double(currentPageIndex)
    )
  }
  
  //  Private Thumbnail Generation
  private func generateThumbnailSync(document: PDFDocument, pageIndex: Int, hash: String) {
    guard let pdfPage = document.page(at: pageIndex) else { return }
    
    let pageRect = pdfPage.bounds(for: .mediaBox)
    guard pageRect.width > 0 && pageRect.height > 0 else { return }
    
    let aspectRatio = pageRect.height / pageRect.width
    let thumbWidth: CGFloat = 120.0
    let thumbHeight = thumbWidth * aspectRatio
    
    let thumbnail = pdfPage.thumbnail(of: CGSize(width: thumbWidth, height: thumbHeight), for: .mediaBox)
    
    if let uri = saveThumbnailToCache(thumbnail, page: pageIndex, hash: hash) {
      // Cache in memory
      cacheLock.lock()
      if thumbnailCache[hash] == nil {
        thumbnailCache[hash] = [:]
      }
      thumbnailCache[hash]?[pageIndex] = uri
      cacheLock.unlock()
      
      DispatchQueue.main.async { [weak self] in
        self?.onThumbnailGenerated?(ThumbnailGeneratedEvent(page: Double(pageIndex), uri: uri))
      }
    } else {
      emitErrorOnMain(.thumbnailSaveFailed)
    }
  }
  
  //  Helper Methods
  private func saveThumbnailToCache(_ image: UIImage, page: Int, hash: String) -> String? {
    guard let data = image.jpegData(compressionQuality: 0.8) else { return nil }
    
    let fileName = "\(page).jpg"
    let documentCacheDir = FileManager.default.temporaryDirectory
      .appendingPathComponent("PDFThumbnails")
      .appendingPathComponent(hash)
    
    do {
      try FileManager.default.createDirectory(at: documentCacheDir, withIntermediateDirectories: true)
      let fileURL = documentCacheDir.appendingPathComponent(fileName)
      try data.write(to: fileURL, options: .atomic)
      return fileURL.absoluteString
    } catch {
      return nil
    }
  }
  
  private func getThumbnailPath(hash: String, page: Int) -> URL {
    return FileManager.default.temporaryDirectory
      .appendingPathComponent("PDFThumbnails")
      .appendingPathComponent(hash)
      .appendingPathComponent("\(page).jpg")
  }
  
  private func computeDocumentHash(_ uri: String) -> String {
    let data = Data(uri.utf8)
    let digest = Insecure.MD5.hash(data: data)
    return digest.map { String(format: "%02hhx", $0) }.joined()
  }
  
  private func emitError(_ error: PdfViewerError) {
    onError?(ErrorEvent(message: error.errorDescription ?? "Unknown error", code: error.errorCode))
  }
  
  private func emitErrorOnMain(_ error: PdfViewerError) {
    DispatchQueue.main.async { [weak self] in
      self?.isLoading = false
      self?.emitError(error)
    }
  }
  
  private func ensureMainThread(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }
  
  private func cleanupThumbnailDirectory() {
    let cacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("PDFThumbnails")
    try? FileManager.default.removeItem(at: cacheDir)
  }
}
