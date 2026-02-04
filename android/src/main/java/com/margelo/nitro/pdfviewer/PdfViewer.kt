package com.margelo.nitro.pdfviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import android.util.LruCache
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.View.MeasureSpec
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.core.view.doOnLayout
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.proguard.annotations.DoNotStrip
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

/**
 * A high-performance PDF viewer component for React Native with Nitro integration.
 * Supports zooming, thumbnails, page navigation, and efficient memory management.
 */
@DoNotStrip
class PdfViewer(context: Context) : FrameLayout(context) {

    companion object {
        private const val TAG = "PdfViewer"
        
        // Memory management
        private const val CACHE_SIZE_PERCENTAGE = 0.25
        private const val MAX_BITMAP_DIMENSION = 4096
        private const val ESTIMATED_MEMORY_WARNING_MB = 50
        
        // Rendering quality (fixed - zoom uses view transformation)
        private const val BASE_RENDER_QUALITY = 1.5f
        
        // Preloading
        private const val PRELOAD_RANGE = 1
        private const val INITIAL_PRELOAD_COUNT = 10
        private const val INITIAL_PRELOAD_DELAY_MS = 50L
        private const val LAZY_PRELOAD_DELAY_MS = 100L
        
        // UI
        private const val LOADING_INDICATOR_SIZE_DP = 48
        private const val THUMBNAIL_SIZE = 120
        private const val THUMBNAIL_QUALITY = 85
        private const val VIEW_CACHE_SIZE = 10
        private const val RECYCLED_VIEW_POOL_SIZE = 20
        
        // Network
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val READ_TIMEOUT_MS = 60_000
        private const val CACHE_VALIDITY_MS = 3600_000L
        
        // Default PDF page dimensions (US Letter)
        private const val DEFAULT_PAGE_WIDTH = 612
        private const val DEFAULT_PAGE_HEIGHT = 792
    }

    // region Core PDF Components
    
    private var pdfRenderer: PdfRenderer? = null
    private var parcelFileDescriptor: ParcelFileDescriptor? = null
    private val renderMutex = Mutex()
    private val componentScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    
    // endregion
    
    // region UI Components
    
    private val recyclerView: RecyclerView
    private val loadingIndicator: ProgressBar
    private var adapter: PdfPageAdapter? = null
    
    // endregion
    
    // region Gesture Handling
    
    private val scaleGestureDetector: ScaleGestureDetector
    private val gestureDetector: GestureDetector
    @Volatile private var isScaling = false
    
    // endregion
    
    // region Rendering State
    
    private val activeRenderJobs = mutableMapOf<Int, Job>()
    private val bitmapCache: LruCache<String, Bitmap>
    private val pageDimensions = ConcurrentHashMap<Int, PageDimension>()
    
    // endregion
    
    // region Thumbnail Cache
    
    private val thumbnailCache = ConcurrentHashMap<String, ConcurrentHashMap<Int, String>>()
    private val pendingThumbnails: MutableSet<Int> = ConcurrentHashMap.newKeySet()
    
    // endregion
    
    // region Document State
    
    @Volatile private var currentLoadJob: Job? = null
    @Volatile private var documentHash: String? = null
    
    private val lifecycleObserver = LifecycleEventObserver { _, event ->
        if (event == Lifecycle.Event.ON_STOP) {
            cleanupAllThumbnails()
        }
    }
    
    private val prefs by lazy { 
        context.getSharedPreferences("pdf_viewer_state", Context.MODE_PRIVATE) 
    }
    
    // endregion
    
    // region Public Properties
    
    private var _sourceUri: String? = null
    var sourceUri: String?
        get() = _sourceUri
        set(value) {
            if (_sourceUri != value) {
                _sourceUri = value
                value?.let(::loadDocument)
            }
        }
    
    var showsActivityIndicator: Boolean = true
        set(value) {
            if (field != value) {
                field = value
                updateLoadingIndicator()
            }
        }
    
    var spacing: Float = 8f
    var enableZoom: Boolean = true
    var minScale: Float = 0.5f
    var maxScale: Float = 4.0f
    
    var contentInsetTop: Float = 0f
        set(value) { field = value; updateContentInsets() }
    var contentInsetBottom: Float = 0f
        set(value) { field = value; updateContentInsets() }
    var contentInsetLeft: Float = 0f
        set(value) { field = value; updateContentInsets() }
    var contentInsetRight: Float = 0f
        set(value) { field = value; updateContentInsets() }
    
    // endregion
    
    // region Callbacks
    
    var onLoadCompleteCallback: ((pageCount: Int, pageWidth: Int, pageHeight: Int) -> Unit)? = null
    var onPageChangeCallback: ((page: Int, pageCount: Int) -> Unit)? = null
    var onScaleChangeCallback: ((scale: Float) -> Unit)? = null
    var onErrorCallback: ((message: String, code: String) -> Unit)? = null
    var onThumbnailGeneratedCallback: ((page: Int, uri: String) -> Unit)? = null
    var onLoadingChangeCallback: ((isLoading: Boolean) -> Unit)? = null
    
    // endregion
    
    // region Runtime State
    
    @Volatile private var currentScale = 1.0f
    @Volatile private var lastReportedPage = -1
    @Volatile private var isLoading = false
    @Volatile private var viewWidth = 0
    @Volatile private var needsInitialLayout = true
    
    // Zoom/Pan state
    private var translateX = 0f
    private var translateY = 0f
    private var lastTouchX = 0f
    private var lastTouchY = 0f
    private var isPanning = false
    private var activePointerId = MotionEvent.INVALID_POINTER_ID
    
    // endregion
    
    /** Simple data class for page dimensions */
    private data class PageDimension(val width: Int, val height: Int)
    
    init {
        ProcessLifecycleOwner.get().lifecycle.addObserver(lifecycleObserver)
        
        recyclerView = createRecyclerView()
        loadingIndicator = createLoadingIndicator()
        scaleGestureDetector = ScaleGestureDetector(context, ScaleListener())
        gestureDetector = GestureDetector(context, GestureListener())
        bitmapCache = createBitmapCache()
        
        setupRecyclerView()
        applySpacing()
        
        addView(recyclerView)
        addView(loadingIndicator)
        
        doOnLayout {
            val newWidth = width
            if (newWidth > 0 && newWidth != viewWidth) {
                viewWidth = newWidth
                adapter?.notifyDataSetChanged()
            }
        }
    }
    
    private fun createRecyclerView(): RecyclerView = RecyclerView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        setHasFixedSize(false)
        setItemViewCacheSize(VIEW_CACHE_SIZE)
        recycledViewPool.setMaxRecycledViews(0, RECYCLED_VIEW_POOL_SIZE)
        requestDisallowInterceptTouchEvent(false)
        clipToPadding = false
    }
    
    private fun createLoadingIndicator(): ProgressBar = ProgressBar(context).apply {
        val size = (LOADING_INDICATOR_SIZE_DP * context.resources.displayMetrics.density).toInt()
        layoutParams = LayoutParams(size, size).apply {
            gravity = android.view.Gravity.CENTER
        }
        isIndeterminate = true
        visibility = View.GONE
    }
    
    private fun createBitmapCache(): LruCache<String, Bitmap> {
        val maxMemoryKb = (Runtime.getRuntime().maxMemory() / 1024).toInt()
        val cacheSize = (maxMemoryKb * CACHE_SIZE_PERCENTAGE).toInt()
        
        return object : LruCache<String, Bitmap>(cacheSize) {
            override fun sizeOf(key: String, bitmap: Bitmap): Int = bitmap.byteCount / 1024
        }
    }
    
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        
        val newWidth = right - left
        if (newWidth > 0 && newWidth != viewWidth) {
            viewWidth = newWidth
            post { adapter?.notifyDataSetChanged() }
        }
        
        if (needsInitialLayout && newWidth > 0 && bottom > 0 && pdfRenderer != null) {
            needsInitialLayout = false
            scheduleInitialLayout(newWidth, bottom - top)
        }
    }
    
    private fun scheduleInitialLayout(width: Int, height: Int) {
        recyclerView.viewTreeObserver.addOnPreDrawListener(
            object : android.view.ViewTreeObserver.OnPreDrawListener {
                override fun onPreDraw(): Boolean {
                    recyclerView.viewTreeObserver.removeOnPreDrawListener(this)
                    recyclerView.measure(
                        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
                    )
                    recyclerView.layout(0, 0, width, height)
                    preloadVisibleAndAdjacentPages()
                    return true
                }
            }
        )
    }
    
    private fun applySpacing() {
        recyclerView.addItemDecoration(PageSpacingDecoration())
    }
    
    private inner class PageSpacingDecoration : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(
            outRect: Rect,
            view: View,
            parent: RecyclerView,
            state: RecyclerView.State
        ) {
            val position = parent.getChildAdapterPosition(view)
            if (position > 0) {
                outRect.top = spacing.toInt()
            }
        }
    }
    
    private fun updateContentInsets() {
        recyclerView.setPadding(
            contentInsetLeft.toInt(),
            contentInsetTop.toInt(),
            contentInsetRight.toInt(),
            contentInsetBottom.toInt()
        )
    }
    
    private fun setupRecyclerView() {
        recyclerView.layoutManager = LinearLayoutManager(context, LinearLayoutManager.VERTICAL, false)
        recyclerView.addOnScrollListener(PageScrollListener())
    }
    
    private inner class PageScrollListener : RecyclerView.OnScrollListener() {
        private var scrollState = RecyclerView.SCROLL_STATE_IDLE
        
        override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
            val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
            val firstVisible = layoutManager.findFirstVisibleItemPosition()
            
            if (firstVisible >= 0 && firstVisible != lastReportedPage) {
                lastReportedPage = firstVisible
                emitPageChange(firstVisible)
                persistCurrentPage(firstVisible)
            }
            
            if (scrollState == RecyclerView.SCROLL_STATE_IDLE) {
                schedulePreload()
            }
        }
        
        override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
            scrollState = newState
            if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                schedulePreload()
            }
        }
    }
    
    private fun persistCurrentPage(page: Int) {
        documentHash?.let { hash ->
            prefs.edit().putInt("page_$hash", page).apply()
        }
    }
    
    // region Touch Handling
    
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!enableZoom) {
            return recyclerView.onTouchEvent(event)
        }
        
        // Always let scale detector examine events
        scaleGestureDetector.onTouchEvent(event)
        gestureDetector.onTouchEvent(event)
        
        if (scaleGestureDetector.isInProgress) {
            isScaling = true
            isPanning = false
            return true
        }
        
        // Handle panning when zoomed in
        if (currentScale > 1.0f) {
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    activePointerId = event.getPointerId(0)
                    lastTouchX = event.x
                    lastTouchY = event.y
                    isPanning = true
                    parent?.requestDisallowInterceptTouchEvent(true)
                }
                MotionEvent.ACTION_MOVE -> {
                    if (isPanning && !isScaling) {
                        val pointerIndex = event.findPointerIndex(activePointerId)
                        if (pointerIndex >= 0) {
                            val x = event.getX(pointerIndex)
                            val y = event.getY(pointerIndex)
                            
                            val dx = x - lastTouchX
                            val dy = y - lastTouchY
                            
                            applyTranslation(dx, dy)
                            
                            lastTouchX = x
                            lastTouchY = y
                        }
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    isPanning = false
                    isScaling = false
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                    parent?.requestDisallowInterceptTouchEvent(false)
                }
                MotionEvent.ACTION_POINTER_UP -> {
                    val pointerIndex = event.actionIndex
                    val pointerId = event.getPointerId(pointerIndex)
                    if (pointerId == activePointerId) {
                        val newPointerIndex = if (pointerIndex == 0) 1 else 0
                        if (newPointerIndex < event.pointerCount) {
                            lastTouchX = event.getX(newPointerIndex)
                            lastTouchY = event.getY(newPointerIndex)
                            activePointerId = event.getPointerId(newPointerIndex)
                        }
                    }
                }
            }
            return true
        }
        
        // At scale 1.0, let RecyclerView handle scrolling
        if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
            isScaling = false
            isPanning = false
        }
        
        return recyclerView.onTouchEvent(event)
    }
    
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (!enableZoom) return false
        
        scaleGestureDetector.onTouchEvent(event)
        
        // Intercept if scaling or zoomed in (to handle panning)
        if (scaleGestureDetector.isInProgress) return true
        if (currentScale > 1.0f && event.pointerCount == 1) return true
        
        return false
    }
    
    private fun applyTranslation(dx: Float, dy: Float) {
        // Calculate bounds for panning
        val scaledWidth = width * currentScale
        val scaledHeight = recyclerView.computeVerticalScrollRange() * currentScale
        
        val maxTranslateX = (scaledWidth - width) / 2f
        val maxTranslateY = (scaledHeight - height) / 2f
        
        translateX = (translateX + dx).coerceIn(-maxTranslateX, maxTranslateX)
        translateY = (translateY + dy).coerceIn(-maxTranslateY, maxTranslateY)
        
        recyclerView.translationX = translateX
        recyclerView.translationY = translateY
    }
    
    private fun applyZoomTransform(focusX: Float, focusY: Float) {
        recyclerView.pivotX = focusX
        recyclerView.pivotY = focusY
        recyclerView.scaleX = currentScale
        recyclerView.scaleY = currentScale
        
        // Constrain translation after scale change
        if (currentScale <= 1.0f) {
            translateX = 0f
            translateY = 0f
            recyclerView.translationX = 0f
            recyclerView.translationY = 0f
        } else {
            applyTranslation(0f, 0f)
        }
    }
    
    private fun resetZoomTransform() {
        currentScale = 1.0f
        translateX = 0f
        translateY = 0f
        recyclerView.scaleX = 1.0f
        recyclerView.scaleY = 1.0f
        recyclerView.translationX = 0f
        recyclerView.translationY = 0f
        recyclerView.pivotX = width / 2f
        recyclerView.pivotY = height / 2f
    }
    
    // endregion
    
    // region Document Loading
    
    fun loadDocument(uri: String?) {
        if (BuildConfig.DEBUG) Log.d(TAG, "loadDocument: $uri")
        
        if (uri.isNullOrBlank()) {
            Log.e(TAG, "URI is null or blank")
            emitError("URI cannot be empty", "INVALID_URI")
            return
        }
        
        currentLoadJob?.cancel()
        isLoading = true
        setLoadingState(true)
        showLoading(true)
        cancelAllRenderJobs()
        bitmapCache.evictAll()
        
        currentLoadJob = componentScope.launch(Dispatchers.IO) {
            try {
                val file = downloadOrGetFile(uri)
                require(file.exists()) { "File does not exist: ${file.absolutePath}" }
                require(file.canRead()) { "Cannot read file: ${file.absolutePath}" }
                
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(fd)
                require(renderer.pageCount > 0) { "PDF has no pages" }
                
                initializeDocument(renderer, fd)
            } catch (e: SecurityException) {
                handleLoadError("PDF is password protected or encrypted", "SECURITY_ERROR", e)
            } catch (e: java.io.FileNotFoundException) {
                handleLoadError("File not found: ${e.message}", "FILE_NOT_FOUND", e)
            } catch (e: java.io.IOException) {
                handleLoadError("Failed to read PDF: ${e.message}", "IO_ERROR", e)
            } catch (e: IllegalArgumentException) {
                handleLoadError("Invalid or corrupted PDF: ${e.message}", "INVALID_FILE", e)
            } catch (e: Exception) {
                handleLoadError("Failed to load PDF: ${e.message}", "LOAD_FAILED", e)
            } finally {
                currentLoadJob = null
            }
        }
    }
    
    private suspend fun initializeDocument(renderer: PdfRenderer, fd: ParcelFileDescriptor) {
        val firstDim = loadFirstPageDimensions(renderer)
        
        componentScope.launch(Dispatchers.IO) {
            preloadInitialPageDimensions(renderer)
        }
        
        withContext(Dispatchers.Main) {
            closePdfRenderer()
            
            pdfRenderer = renderer
            parcelFileDescriptor = fd
            documentHash = computeDocumentHash()
            
            resetDocumentState()
            
            adapter = PdfPageAdapter()
            recyclerView.adapter = adapter
            
            showLoading(false)
            setLoadingState(false)
            
            emitLoadComplete(renderer.pageCount, firstDim.width, firstDim.height)
            restoreLastViewedPage(renderer)
        }
    }
    
    private suspend fun loadFirstPageDimensions(renderer: PdfRenderer): PageDimension {
        return try {
            renderMutex.withLock {
                renderer.openPage(0).use { page ->
                    PageDimension(page.width, page.height).also {
                        pageDimensions[0] = it
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading first page", e)
            PageDimension(DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT)
        }
    }
    
    private fun resetDocumentState() {
        bitmapCache.evictAll()
        pageDimensions.clear()
        pendingThumbnails.clear()
        lastReportedPage = -1
    }
    
    private fun restoreLastViewedPage(renderer: PdfRenderer) {
        post {
            val lastPage = documentHash?.let { prefs.getInt("page_$it", 0) } ?: 0
            
            Choreographer.getInstance().postFrameCallback {
                if (lastPage > 0 && lastPage < renderer.pageCount) {
                    recyclerView.scrollToPosition(lastPage)
                    lastReportedPage = lastPage
                    emitPageChange(lastPage)
                } else {
                    lastReportedPage = 0
                    emitPageChange(0)
                    preloadInitialPages()
                }
            }
        }
    }
    
    private fun preloadInitialPages() {
        val pageCount = pdfRenderer?.pageCount ?: return
        repeat(minOf(PRELOAD_RANGE + 1, pageCount)) { i ->
            startPageRender(i)
        }
    }
    
    private suspend fun handleLoadError(message: String, code: String, error: Exception) {
        Log.e(TAG, message, error)
        withContext(Dispatchers.Main) {
            showLoading(false)
            setLoadingState(false)
            emitError(message, code)
        }
    }
    
    private suspend fun preloadInitialPageDimensions(renderer: PdfRenderer) {
        val pagesToPreload = minOf(INITIAL_PRELOAD_COUNT, renderer.pageCount)
        
        // Preload first batch with short delay
        for (i in 1 until pagesToPreload) {
            loadPageDimensionIfMissing(renderer, i, INITIAL_PRELOAD_DELAY_MS)
        }
        
        // Lazily load remaining pages with longer delay
        for (i in pagesToPreload until renderer.pageCount) {
            loadPageDimensionIfMissing(renderer, i, LAZY_PRELOAD_DELAY_MS)
        }
    }
    
    private suspend fun loadPageDimensionIfMissing(renderer: PdfRenderer, index: Int, delayMs: Long) {
        try {
            delay(delayMs)
            renderMutex.withLock {
                if (pageDimensions[index] == null) {
                    renderer.openPage(index).use { page ->
                        pageDimensions[index] = PageDimension(page.width, page.height)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error preloading page $index dimensions", e)
        }
    }
    
    private suspend fun getPageDimensions(pageIndex: Int): PageDimension {
        pageDimensions[pageIndex]?.let { return it }
        
        val renderer = pdfRenderer ?: return PageDimension(DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT)
        
        return try {
            renderMutex.withLock {
                pageDimensions[pageIndex] ?: run {
                    renderer.openPage(pageIndex).use { page ->
                        PageDimension(page.width, page.height).also {
                            pageDimensions[pageIndex] = it
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading page $pageIndex dimensions", e)
            PageDimension(DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT)
        }
    }
    
    // endregion
    
    // region File Handling
    
    private fun closePdfRenderer() {
        runCatching { pdfRenderer?.close() }
            .onFailure { Log.e(TAG, "Error closing renderer", it) }
        pdfRenderer = null
        
        runCatching { parcelFileDescriptor?.close() }
            .onFailure { Log.e(TAG, "Error closing file descriptor", it) }
        parcelFileDescriptor = null
    }
    
    private suspend fun downloadOrGetFile(uri: String): File = withContext(Dispatchers.IO) {
        when {
            uri.startsWith("file://") -> File(uri.removePrefix("file://"))
            uri.startsWith("http://") || uri.startsWith("https://") -> downloadPdf(uri)
            else -> File(uri)
        }
    }
    
    private fun downloadPdf(uri: String): File {
        val hash = uri.hashCode().toString()
        val file = File(context.cacheDir, "pdf_$hash.pdf")
        val tempFile = File(context.cacheDir, "pdf_${hash}_temp.pdf")
        
        if (file.exists() && isCacheValid(file)) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Using cached PDF: ${file.absolutePath}")
            return file
        }
        
        try {
            val connection = URL(uri).openConnection().apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/pdf")
                addConditionalHeaders(file)
            }
            
            connection.getInputStream().use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output, bufferSize = 8192)
                }
            }
            
            file.delete()
            tempFile.renameTo(file)
            
            if (BuildConfig.DEBUG) Log.d(TAG, "Download completed: ${file.absolutePath}")
        } catch (e: Exception) {
            tempFile.delete()
            if (file.exists()) {
                Log.w(TAG, "Download failed, using cached version: ${e.message}")
                return file
            }
            throw e
        }
        
        return file
    }
    
    private fun isCacheValid(file: File): Boolean =
        System.currentTimeMillis() - file.lastModified() < CACHE_VALIDITY_MS
    
    private fun java.net.URLConnection.addConditionalHeaders(cachedFile: File) {
        if (cachedFile.exists()) {
            val dateFormat = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("GMT")
            }
            setRequestProperty("If-Modified-Since", dateFormat.format(Date(cachedFile.lastModified())))
        }
    }
    
    // endregion
    
    // region Loading State
    
    private fun showLoading(show: Boolean) {
        loadingIndicator.visibility = if (show && showsActivityIndicator) View.VISIBLE else View.GONE
        recyclerView.visibility = if (show) View.INVISIBLE else View.VISIBLE
    }
    
    private fun updateLoadingIndicator() {
        loadingIndicator.visibility = if (isLoading && showsActivityIndicator) View.VISIBLE else View.GONE
    }
    
    private fun setLoadingState(loading: Boolean) {
        if (isLoading != loading) {
            isLoading = loading
            emitLoadingChange(loading)
        }
    }
    
    private fun cancelAllRenderJobs() {
        synchronized(activeRenderJobs) {
            activeRenderJobs.values.forEach { it.cancel() }
            activeRenderJobs.clear()
        }
    }
    
    // endregion
    
    // region Public API
    
    fun goToPage(page: Int) {
        val renderer = pdfRenderer ?: return emitError("PDF not loaded", "NOT_LOADED")
        
        if (page !in 0 until renderer.pageCount) {
            emitError("Invalid page: $page. Valid range: 0-${renderer.pageCount - 1}", "INVALID_PAGE")
            return
        }
        
        if (BuildConfig.DEBUG) Log.d(TAG, "goToPage: $page")
        
        // Reset zoom when navigating to a page
        if (currentScale != 1.0f) {
            resetZoomTransform()
            emitScaleChange(1.0f)
        }
        
        post {
            recyclerView.smoothScrollToPosition(page)
            emitPageChange(page)
            postDelayed({ schedulePreload() }, 100)
        }
    }
    
    fun setScale(scale: Float) {
        setScale(scale, width / 2f, height / 2f)
    }
    
    private fun setScale(scale: Float, focusX: Float, focusY: Float) {
        if (!enableZoom) return emitError("Zoom is disabled", "ZOOM_DISABLED")
        
        val clampedScale = scale.coerceIn(minScale, maxScale)
        if (kotlin.math.abs(clampedScale - currentScale) < 0.01f) return
        
        if (BuildConfig.DEBUG) Log.d(TAG, "setScale: $clampedScale (was $currentScale)")
        
        currentScale = clampedScale
        applyZoomTransform(focusX, focusY)
        emitScaleChange(currentScale)
    }
    
    fun getDocumentInfo(): Map<String, Any>? {
        val renderer = pdfRenderer ?: return null
        if (renderer.pageCount == 0) return null
        
        val page = renderer.openPage(0)
        val info: Map<String, Any> = mapOf(
            "pageCount" to renderer.pageCount,
            "pageWidth" to page.width,
            "pageHeight" to page.height,
            "currentPage" to ((recyclerView.layoutManager as? LinearLayoutManager)
                ?.findFirstVisibleItemPosition() ?: 0)
        )
        page.close()
        
        return info
    }
    
    // endregion
    
    // region Thumbnail Generation
    
    fun generateThumbnail(page: Int) {
        if (BuildConfig.DEBUG) Log.d(TAG, "generateThumbnail: $page")
        
        val renderer = pdfRenderer ?: return emitError("PDF not loaded", "NOT_LOADED")
        
        if (page !in 0 until renderer.pageCount) {
            emitError("Invalid page: $page. Valid range: 0-${renderer.pageCount - 1}", "INVALID_PAGE")
            return
        }
        
        val hash = documentHash ?: return emitError("Document hash not available", "HASH_ERROR")
        
        // Check memory cache
        thumbnailCache[hash]?.get(page)?.let { cachedUri ->
            emitThumbnailGenerated(page, cachedUri)
            return
        }
        
        // Check disk cache
        val diskPath = getThumbnailPath(hash, page)
        if (File(diskPath).exists()) {
            val uri = "file://$diskPath"
            thumbnailCache.getOrPut(hash) { ConcurrentHashMap() }[page] = uri
            emitThumbnailGenerated(page, uri)
            return
        }
        
        // Skip if already being generated
        if (!pendingThumbnails.add(page)) return
        
        componentScope.launch(Dispatchers.IO) {
            try {
                val thumbnail = renderThumbnail(page)
                val uri = saveThumbnailToCache(thumbnail, page, hash)
                
                thumbnailCache.getOrPut(hash) { ConcurrentHashMap() }[page] = uri
                
                withContext(Dispatchers.Main) {
                    emitThumbnailGenerated(page, uri)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error generating thumbnail for page $page", e)
                withContext(Dispatchers.Main) {
                    emitError("Thumbnail generation failed: ${e.message}", "THUMBNAIL_ERROR")
                }
            } finally {
                pendingThumbnails.remove(page)
            }
        }
    }
    
    fun generateAllThumbnails() {
        val renderer = pdfRenderer ?: return
        val hash = documentHash ?: return
        
        componentScope.launch(Dispatchers.IO) {
            for (i in 0 until renderer.pageCount) {
                generateThumbnailForPage(i, hash)
                delay(50)
            }
        }
    }
    
    private suspend fun generateThumbnailForPage(page: Int, hash: String) {
        // Check memory cache
        thumbnailCache[hash]?.get(page)?.let { cachedUri ->
            withContext(Dispatchers.Main) { emitThumbnailGenerated(page, cachedUri) }
            return
        }
        
        // Check disk cache
        val diskPath = getThumbnailPath(hash, page)
        if (File(diskPath).exists()) {
            val uri = "file://$diskPath"
            thumbnailCache.getOrPut(hash) { ConcurrentHashMap() }[page] = uri
            withContext(Dispatchers.Main) { emitThumbnailGenerated(page, uri) }
            return
        }
        
        if (!pendingThumbnails.add(page)) return
        
        try {
            val thumbnail = renderThumbnail(page)
            val uri = saveThumbnailToCache(thumbnail, page, hash)
            
            thumbnailCache.getOrPut(hash) { ConcurrentHashMap() }[page] = uri
            withContext(Dispatchers.Main) { emitThumbnailGenerated(page, uri) }
        } catch (e: Exception) {
            Log.e(TAG, "Error generating thumbnail for page $page", e)
            withContext(Dispatchers.Main) {
                emitError("Thumbnail $page failed: ${e.message}", "THUMBNAIL_ERROR")
            }
        } finally {
            pendingThumbnails.remove(page)
        }
    }
    
    private suspend fun renderThumbnail(pageIndex: Int): Bitmap = withContext(Dispatchers.IO) {
        val renderer = pdfRenderer ?: throw IllegalStateException("No renderer")
        
        renderMutex.withLock {
            renderer.openPage(pageIndex).use { page ->
                val aspectRatio = page.height.toFloat() / page.width.toFloat()
                val thumbWidth = THUMBNAIL_SIZE
                val thumbHeight = (THUMBNAIL_SIZE * aspectRatio).roundToInt()
                
                Bitmap.createBitmap(thumbWidth, thumbHeight, Bitmap.Config.ARGB_8888).apply {
                    Canvas(this).drawColor(Color.WHITE)
                    page.render(this, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                }
            }
        }
    }
    
    private fun saveThumbnailToCache(bitmap: Bitmap, page: Int, hash: String): String {
        val hashDir = File(context.cacheDir, "PDFThumbnails/$hash").apply { mkdirs() }
        val file = File(hashDir, "thumb_$page.jpg")
        
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, THUMBNAIL_QUALITY, out)
        }
        
        if (!bitmap.isRecycled) bitmap.recycle()
        
        return "file://${file.absolutePath}"
    }
    
    private fun getThumbnailPath(hash: String, page: Int): String =
        "${context.cacheDir}/PDFThumbnails/$hash/thumb_$page.jpg"
    
    private fun computeDocumentHash(): String {
        val uri = sourceUri ?: return "unknown"
        return try {
            MessageDigest.getInstance("MD5")
                .digest(uri.toByteArray())
                .joinToString("") { "%02x".format(it) }
                .take(8)
        } catch (e: Exception) {
            "unknown"
        }
    }
    
    private fun cleanupAllThumbnails() {
        runCatching {
            File(context.cacheDir, "PDFThumbnails").deleteRecursively()
            Log.d(TAG, "Cleaned up all thumbnail cache directories")
        }.onFailure {
            Log.e(TAG, "Error cleaning up thumbnail directories", it)
        }
    }
    
    // endregion
    
    // region Page Rendering
    
    private fun schedulePreload() {
        Choreographer.getInstance().postFrameCallback {
            preloadVisibleAndAdjacentPages()
        }
    }
    
    private fun preloadVisibleAndAdjacentPages() {
        val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
        val firstVisible = layoutManager.findFirstVisibleItemPosition()
        val lastVisible = layoutManager.findLastVisibleItemPosition()
        
        if (firstVisible < 0 || lastVisible < 0) return
        
        val pageCount = pdfRenderer?.pageCount ?: return
        val startPage = (firstVisible - PRELOAD_RANGE).coerceAtLeast(0)
        val endPage = (lastVisible + PRELOAD_RANGE).coerceAtMost(pageCount - 1)
        
        for (i in startPage..endPage) {
            if (bitmapCache.get("$i") == null) {
                startPageRender(i)
            }
        }
    }
    
    private fun startPageRender(pageIndex: Int) {
        synchronized(activeRenderJobs) {
            if (activeRenderJobs.containsKey(pageIndex)) return
            
            val job = componentScope.launch(Dispatchers.IO) {
                try {
                    renderPage(pageIndex)?.let { bitmap ->
                        val cacheKey = "$pageIndex"
                        bitmapCache.put(cacheKey, bitmap)
                        
                        withContext(Dispatchers.Main) {
                            adapter?.notifyItemChanged(pageIndex)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error rendering page $pageIndex", e)
                } finally {
                    synchronized(activeRenderJobs) {
                        activeRenderJobs.remove(pageIndex)
                    }
                }
            }
            
            activeRenderJobs[pageIndex] = job
        }
    }
    
    private suspend fun renderPage(pageIndex: Int): Bitmap? = withContext(Dispatchers.IO) {
        val renderer = pdfRenderer ?: return@withContext null
        if (viewWidth <= 0) return@withContext null
        
        try {
            renderMutex.withLock {
                renderer.openPage(pageIndex).use { page ->
                    val (bitmapWidth, bitmapHeight) = calculateBitmapDimensions(page)
                    
                    logBitmapStats(pageIndex, bitmapWidth, bitmapHeight)
                    
                    Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888).apply {
                        Canvas(this).drawColor(Color.WHITE)
                        page.render(this, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    }
                }
            }
        } catch (e: OutOfMemoryError) {
            handleOutOfMemoryError(pageIndex, e)
            null
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Invalid bitmap dimensions for page $pageIndex", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error rendering page $pageIndex", e)
            null
        }
    }
    
    private fun calculateBitmapDimensions(page: PdfRenderer.Page): Pair<Int, Int> {
        // Render at view width with quality multiplier (zoom is handled by view transform)
        val baseScale = viewWidth.toFloat() / page.width
        val totalScale = baseScale * BASE_RENDER_QUALITY
        
        var bitmapWidth = (page.width * totalScale).toInt().coerceAtLeast(1)
        var bitmapHeight = (page.height * totalScale).toInt().coerceAtLeast(1)
        
        // Enforce maximum bitmap dimensions
        if (bitmapWidth > MAX_BITMAP_DIMENSION || bitmapHeight > MAX_BITMAP_DIMENSION) {
            val aspectRatio = page.width.toFloat() / page.height.toFloat()
            if (bitmapWidth > bitmapHeight) {
                bitmapWidth = MAX_BITMAP_DIMENSION
                bitmapHeight = (MAX_BITMAP_DIMENSION / aspectRatio).toInt()
            } else {
                bitmapHeight = MAX_BITMAP_DIMENSION
                bitmapWidth = (MAX_BITMAP_DIMENSION * aspectRatio).toInt()
            }
        }
        
        return Pair(bitmapWidth, bitmapHeight)
    }
    
    private fun logBitmapStats(pageIndex: Int, width: Int, height: Int) {
        if (!BuildConfig.DEBUG) return
        
        val estimatedMemoryMB = (width * height * 4) / (1024 * 1024)
        if (estimatedMemoryMB > ESTIMATED_MEMORY_WARNING_MB) {
            Log.w(TAG, "Page $pageIndex: Large bitmap ${width}x${height} (~${estimatedMemoryMB}MB)")
        }
    }
    
    private suspend fun handleOutOfMemoryError(pageIndex: Int, error: OutOfMemoryError) {
        Log.e(TAG, "OOM rendering page $pageIndex at scale $currentScale", error)
        bitmapCache.evictAll()
        System.gc()
        
        withContext(Dispatchers.Main) {
            emitError("Out of memory at zoom level ${currentScale}x. Try reducing zoom.", "OOM_ERROR")
        }
    }
    
    // endregion
    
    // region RecyclerView Adapter
    
    private inner class PdfPageAdapter : RecyclerView.Adapter<PdfPageViewHolder>() {
        
        override fun getItemCount(): Int = pdfRenderer?.pageCount ?: 0
        
        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): PdfPageViewHolder {
            val imageView = ImageView(context).apply {
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setBackgroundColor(Color.WHITE)
            }
            return PdfPageViewHolder(imageView)
        }
        
        override fun onBindViewHolder(holder: PdfPageViewHolder, position: Int) {
            bindPageDimensions(holder, position)
            bindPageBitmap(holder, position)
        }
        
        private fun bindPageDimensions(holder: PdfPageViewHolder, position: Int) {
            val dimensions = pageDimensions[position]
            
            if (dimensions != null && viewWidth > 0) {
                // Scale to fit width (no zoom factor - zoom is handled by view transformation)
                val scale = viewWidth.toFloat() / dimensions.width
                val targetHeight = (dimensions.height * scale).toInt().coerceAtLeast(100)
                holder.imageView.layoutParams.height = targetHeight
            } else {
                holder.imageView.layoutParams.height = (viewWidth * 1.414f).toInt().coerceAtLeast(100)
                loadDimensionsAsync(holder, position)
            }
        }
        
        private fun loadDimensionsAsync(holder: PdfPageViewHolder, position: Int) {
            componentScope.launch(Dispatchers.IO) {
                val dims = getPageDimensions(position)
                withContext(Dispatchers.Main) {
                    if (holder.bindingAdapterPosition == position) {
                        val scale = viewWidth.toFloat() / dims.width
                        val targetHeight = (dims.height * scale).toInt().coerceAtLeast(100)
                        holder.imageView.layoutParams.height = targetHeight
                        holder.imageView.requestLayout()
                    }
                }
            }
        }
        
        private fun bindPageBitmap(holder: PdfPageViewHolder, position: Int) {
            // Cache key no longer includes scale since bitmap is rendered at fixed quality
            val cacheKey = "$position"
            val cached = bitmapCache.get(cacheKey)
            
            if (cached != null && !cached.isRecycled) {
                holder.imageView.setImageBitmap(cached)
            } else {
                holder.imageView.setImageBitmap(createPlaceholderBitmap(position))
                startPageRender(position)
            }
        }
        
        override fun onViewRecycled(holder: PdfPageViewHolder) {
            super.onViewRecycled(holder)
            holder.imageView.setImageBitmap(null)
        }
        
        private fun createPlaceholderBitmap(pageIndex: Int): Bitmap {
            val dimensions = pageDimensions[pageIndex]
            val w = dimensions?.let { (it.width * 0.1f).toInt() } ?: 100
            val h = dimensions?.let { (it.height * 0.1f).toInt() } ?: 100
            
            return Bitmap.createBitmap(
                w.coerceAtLeast(10),
                h.coerceAtLeast(10),
                Bitmap.Config.ARGB_8888
            ).apply {
                Canvas(this).drawColor(Color.WHITE)
            }
        }
    }
    
    private inner class PdfPageViewHolder(val imageView: ImageView) : RecyclerView.ViewHolder(imageView)
    
    // endregion
    
    // region Gesture Listeners
    
    private inner class ScaleListener : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        private var lastFocusX = 0f
        private var lastFocusY = 0f
        
        override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
            if (!enableZoom) return false
            lastFocusX = detector.focusX
            lastFocusY = detector.focusY
            return true
        }
        
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            if (!enableZoom) return false
            
            val newScale = (currentScale * detector.scaleFactor).coerceIn(minScale, maxScale)
            if (kotlin.math.abs(newScale - currentScale) > 0.01f) {
                setScale(newScale, detector.focusX, detector.focusY)
            }
            return true
        }
        
        override fun onScaleEnd(detector: ScaleGestureDetector) {
            // Snap to 1.0 if very close
            if (currentScale < 1.05f && currentScale > 0.95f) {
                resetZoomTransform()
                emitScaleChange(1.0f)
            }
        }
    }
    
    private inner class GestureListener : GestureDetector.SimpleOnGestureListener() {
        override fun onDoubleTap(e: MotionEvent): Boolean {
            if (!enableZoom) return false
            
            if (currentScale > 1.1f) {
                // Zoom out to 1.0
                resetZoomTransform()
                emitScaleChange(1.0f)
            } else {
                // Zoom in to 2.0 centered on tap point
                setScale(2.0f, e.x, e.y)
            }
            return true
        }
    }
    
    // endregion
    
    // region Event Emitters
    
    private fun emitLoadComplete(pageCount: Int, pageWidth: Int, pageHeight: Int) {
        onLoadCompleteCallback?.invoke(pageCount, pageWidth, pageHeight)
    }
    
    private fun emitPageChange(page: Int) {
        val pageCount = pdfRenderer?.pageCount ?: return
        onPageChangeCallback?.invoke(page + 1, pageCount)
    }
    
    private fun emitScaleChange(scale: Float) {
        onScaleChangeCallback?.invoke(scale)
    }
    
    private fun emitError(message: String, code: String) {
        onErrorCallback?.invoke(message, code)
    }
    
    private fun emitThumbnailGenerated(page: Int, uri: String) {
        onThumbnailGeneratedCallback?.invoke(page, uri)
    }
    
    private fun emitLoadingChange(loading: Boolean) {
        onLoadingChangeCallback?.invoke(loading)
    }
    
    // endregion
    
    // region Lifecycle
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        
        ProcessLifecycleOwner.get().lifecycle.removeObserver(lifecycleObserver)
        componentScope.cancel()
        cancelAllRenderJobs()
        
        post { recycleCachedBitmaps() }
        
        closePdfRenderer()
        pageDimensions.clear()
        thumbnailCache.clear()
        pendingThumbnails.clear()
    }
    
    private fun recycleCachedBitmaps() {
        val snapshot = bitmapCache.snapshot()
        bitmapCache.evictAll()
        
        snapshot.values.forEach { bitmap ->
            runCatching { if (!bitmap.isRecycled) bitmap.recycle() }
                .onFailure { Log.e(TAG, "Error recycling bitmap", it) }
        }
    }
    
    // endregion
}
