package com.margelo.nitro.pdfviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import android.util.LruCache
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.graphics.Rect
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.core.view.doOnLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.proguard.annotations.DoNotStrip
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.security.MessageDigest
import kotlin.math.roundToInt

@DoNotStrip
class PdfViewer(context: Context) : FrameLayout(context) {
    companion object {
        private const val TAG = "PdfViewer"
        private const val CACHE_SIZE_PERCENTAGE = 0.25
        private const val PRELOAD_RANGE = 1
        // Dynamic quality scaling - prevents OOM at high zoom levels
        private const val BASE_RENDER_QUALITY = 1.5f
        // Maximum bitmap dimension to prevent GPU texture limits and OOM
        private const val MAX_BITMAP_DIMENSION = 4096
        // Threshold for using reduced quality
        private const val HIGH_ZOOM_THRESHOLD = 1.5f
    }

    // Core PDF components
    private var pdfRenderer: PdfRenderer? = null
    private var parcelFileDescriptor: ParcelFileDescriptor? = null
    private val renderMutex = Mutex()
    
    // Coroutine scope with SupervisorJob for error isolation
    private val componentScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    
    // UI components
    private val recyclerView: RecyclerView
    private val loadingIndicator: ProgressBar
    private var adapter: PdfPageAdapter? = null
    
    // Gesture handling
    private val scaleGestureDetector: ScaleGestureDetector
    private val gestureDetector: GestureDetector
    private var isScaling = false
    
    // Rendering state
    private val activeRenderJobs = mutableMapOf<Int, Job>()
    private val bitmapCache: LruCache<String, Bitmap>
    private val pageDimensions = mutableMapOf<Int, Pair<Int, Int>>()
    private val thumbnailCache = java.util.concurrent.ConcurrentHashMap<Int, String>()
    private val pendingThumbnails = java.util.concurrent.ConcurrentHashMap.newKeySet<Int>()
    private var currentLoadJob: Job? = null
    
    // Props
    private var _sourceUri: String? = null
    var sourceUri: String?
        get() = _sourceUri
        set(value) {
            if (_sourceUri != value) {
                _sourceUri = value
                value?.let { loadDocument(it) }
            }
        }
    
    var showsActivityIndicator: Boolean = true
        set(value) {
            if (field != value) {
                field = value
                updateLoadingIndicator()
            }
        }
    
    // Note: horizontal and enablePaging are iOS-only features
    // Android always uses vertical scroll
    var spacing: Float = 8f
    var enableZoom: Boolean = true
    var minScale: Float = 0.5f
    var maxScale: Float = 4.0f
    
    // Content insets for glass UI / transparent bars
    var contentInsetTop: Float = 0f
        set(value) {
            field = value
            updateContentInsets()
        }
    var contentInsetBottom: Float = 0f
        set(value) {
            field = value
            updateContentInsets()
        }
    var contentInsetLeft: Float = 0f
        set(value) {
            field = value
            updateContentInsets()
        }
    var contentInsetRight: Float = 0f
        set(value) {
            field = value
            updateContentInsets()
        }
    
    // Callbacks for HybridPdfViewer integration
    var onLoadCompleteCallback: ((pageCount: Int, pageWidth: Int, pageHeight: Int) -> Unit)? = null
    var onPageChangeCallback: ((page: Int, pageCount: Int) -> Unit)? = null
    var onScaleChangeCallback: ((scale: Float) -> Unit)? = null
    var onErrorCallback: ((message: String, code: String) -> Unit)? = null
    var onThumbnailGeneratedCallback: ((page: Int, uri: String) -> Unit)? = null
    var onLoadingChangeCallback: ((isLoading: Boolean) -> Unit)? = null
    
    // Runtime state
    private var currentScale = 1.0f
    private var lastReportedPage = -1
    private var isLoading = false
    private var viewWidth = 0
    
    init {
        recyclerView = RecyclerView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            setHasFixedSize(false)
            setItemViewCacheSize(4)
            recycledViewPool.setMaxRecycledViews(0, 12)
            
            // Allow parent to intercept touch events for pinch-to-zoom
            requestDisallowInterceptTouchEvent(false)
            
            // Enable drawing content under padding (for glass UI effect)
            clipToPadding = false
        }
        
        loadingIndicator = ProgressBar(context).apply {
            val size = (48 * context.resources.displayMetrics.density).toInt()
            layoutParams = LayoutParams(size, size).apply {
                gravity = android.view.Gravity.CENTER
            }
            isIndeterminate = true
            visibility = View.GONE
        }
        
        scaleGestureDetector = ScaleGestureDetector(context, ScaleListener())
        gestureDetector = GestureDetector(context, GestureListener())
        
        // Initialize bitmap cache (25% of available memory)
        val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
        val cacheSize = (maxMemory * CACHE_SIZE_PERCENTAGE).toInt()
        
        bitmapCache = object : LruCache<String, Bitmap>(cacheSize) {
            override fun sizeOf(key: String, bitmap: Bitmap): Int = bitmap.byteCount / 1024
            
            override fun entryRemoved(evicted: Boolean, key: String, oldValue: Bitmap?, newValue: Bitmap?) {
                // CRITICAL: Don't recycle bitmaps - RecyclerView may still be using them
                // Let GC handle cleanup. Only recycle on component unmount.
            }
        }
        
        setupRecyclerView()
        applySpacing()
        
        addView(recyclerView)
        addView(loadingIndicator)
        
        // Measure view width for proper rendering
        doOnLayout {
            val newWidth = width
            if (newWidth > 0 && newWidth != viewWidth) {
                viewWidth = newWidth
                adapter?.notifyDataSetChanged()
            }
        }
    }
    
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        
        // Update viewWidth whenever layout changes
        val newWidth = right - left
        if (newWidth > 0 && newWidth != viewWidth) {
            viewWidth = newWidth
            post { adapter?.notifyDataSetChanged() }
        }
    }
    
    private fun applySpacing() {
        // Add spacing between PDF pages
        recyclerView.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
                val position = parent.getChildAdapterPosition(view)
                if (position != RecyclerView.NO_POSITION && position > 0) {
                    outRect.top = spacing.toInt()
                }
            }
        })
    }
    
    private fun updateContentInsets() {
        // Apply content insets as padding
        // clipToPadding=false allows content to draw under padding (glass UI effect)
        recyclerView.setPadding(
            contentInsetLeft.toInt(),
            contentInsetTop.toInt(),
            contentInsetRight.toInt(),
            contentInsetBottom.toInt()
        )
    }
    
    private fun setupRecyclerView() {
        // Android always uses vertical scroll (horizontal is iOS-only)
        val layoutManager = LinearLayoutManager(context, LinearLayoutManager.VERTICAL, false)
        recyclerView.layoutManager = layoutManager
        
        recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            private var scrollState = RecyclerView.SCROLL_STATE_IDLE
            
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                
                val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
                val firstVisible = layoutManager.findFirstVisibleItemPosition()
                
                if (firstVisible >= 0 && firstVisible != lastReportedPage) {
                    lastReportedPage = firstVisible
                    emitPageChange(firstVisible)
                }
                
                if (scrollState == RecyclerView.SCROLL_STATE_IDLE) {
                    schedulePreload()
                }
            }
            
            override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
                super.onScrollStateChanged(recyclerView, newState)
                scrollState = newState
                
                if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                    schedulePreload()
                }
            }
        })
    }
    
    override fun onTouchEvent(event: MotionEvent): Boolean {
        var handled = false
        
        if (enableZoom) {
            // Try double-tap first (gestureDetector)
            gestureDetector.onTouchEvent(event)
            
            // Then try scale gesture detector
            scaleGestureDetector.onTouchEvent(event)
            handled = scaleGestureDetector.isInProgress
            isScaling = scaleGestureDetector.isInProgress
            
            if (isScaling) {
                // During scaling, request not to be intercepted
                parent?.requestDisallowInterceptTouchEvent(true)
                recyclerView.requestDisallowInterceptTouchEvent(true)
            }
        }
        
        if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
            isScaling = false
            parent?.requestDisallowInterceptTouchEvent(false)
            recyclerView.requestDisallowInterceptTouchEvent(false)
        }
        
        // Pass to children if not scaling
        if (!handled) {
            handled = recyclerView.onTouchEvent(event)
        }
        
        return handled || super.onTouchEvent(event)
    }
    
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        // Check for pinch gesture
        if (enableZoom) {
            scaleGestureDetector.onTouchEvent(event)
            if (scaleGestureDetector.isInProgress) {
                return true
            }
        }
        return super.onInterceptTouchEvent(event)
    }
    
    fun loadDocument(uri: String?) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "loadDocument called with uri: $uri")
        }
        if (uri.isNullOrBlank()) {
            Log.e(TAG, "URI is null or blank")
            emitError("URI cannot be empty", "INVALID_URI")
            return
        }
        
        // Cancel previous load if in progress
        if (isLoading) {
            if (BuildConfig.DEBUG) {
                Log.w(TAG, "Canceling previous document load")
            }
            currentLoadJob?.cancel()
            currentLoadJob = null
        }
        
        isLoading = true
        setLoadingState(true)
        showLoading(true)
        cancelAllRenderJobs()
        
        // Clear cache without recycling (GC will handle it)
        bitmapCache.evictAll()
        
        currentLoadJob = componentScope.launch(Dispatchers.IO) {
            try {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Starting document download/load for uri: $uri")
                }
                val file = downloadOrGetFile(uri)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "File obtained: ${file.absolutePath}, exists: ${file.exists()}, canRead: ${file.canRead()}")
                }
                
                require(file.exists()) { "File does not exist: ${file.absolutePath}" }
                require(file.canRead()) { "Cannot read file: ${file.absolutePath}" }
                
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(fd)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "PdfRenderer created successfully, pageCount: ${renderer.pageCount}")
                }
                
                require(renderer.pageCount > 0) { "PDF has no pages" }
                
                withContext(Dispatchers.Main) {
                    closePdfRenderer()
                    
                    pdfRenderer = renderer
                    parcelFileDescriptor = fd
                    bitmapCache.evictAll()
                    pageDimensions.clear()
                    thumbnailCache.clear()
                    pendingThumbnails.clear()
                    lastReportedPage = -1
                    
                    // Get first page dimensions immediately for initial render
                    val firstDim = try {
                        renderMutex.withLock {
                            renderer.openPage(0).use { page ->
                                Pair(page.width, page.height).also {
                                    pageDimensions[0] = it
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error reading first page", e)
                        Pair(612, 792)
                    }
                    
                    // Preload a few more page dimensions in background (non-blocking)
                    // This helps with initial scrolling but doesn't delay the initial render
                    componentScope.launch(Dispatchers.IO) {
                        preloadInitialPageDimensions(renderer)
                    }
                    
                    adapter = PdfPageAdapter()
                    recyclerView.adapter = adapter
                    
                    showLoading(false)
                    setLoadingState(false)
                    
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Emitting loadComplete: pageCount=${renderer.pageCount}, width=${firstDim.first}, height=${firstDim.second}")
                    }
                    emitLoadComplete(renderer.pageCount, firstDim.first, firstDim.second)
                    
                    // Force initial layout and render by scrolling slightly
                    // This ensures content appears without requiring user interaction
                    post {
                        recyclerView.scrollBy(0, 2)
                        recyclerView.scrollBy(0, -2)
                    }
                    
                    schedulePreload()
                }
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
    
    private suspend fun handleLoadError(message: String, code: String, error: Exception) {
        Log.e(TAG, message, error)
        withContext(Dispatchers.Main) {
            showLoading(false)
            setLoadingState(false)
            emitError(message, code)
        }
    }
    
    // Preload only first few pages (non-blocking) for better initial experience
    private suspend fun preloadInitialPageDimensions(renderer: PdfRenderer) {
        // Preload first 5-10 pages to improve initial scrolling
        val pagesToPreload = minOf(10, renderer.pageCount)
        for (i in 1 until pagesToPreload) { // Start from 1 since 0 is already loaded
            try {
                kotlinx.coroutines.delay(50) // Small delay to not block other operations
                renderMutex.withLock {
                    if (pageDimensions[i] == null) { // Only if not already loaded
                        renderer.openPage(i).use { page ->
                            pageDimensions[i] = Pair(page.width, page.height)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error preloading page $i dimensions", e)
            }
        }
        
        // Lazily load remaining pages with lower priority
        if (renderer.pageCount > pagesToPreload) {
            for (i in pagesToPreload until renderer.pageCount) {
                try {
                    kotlinx.coroutines.delay(100) // Longer delay for non-critical pages
                    renderMutex.withLock {
                        if (pageDimensions[i] == null) {
                            renderer.openPage(i).use { page ->
                                pageDimensions[i] = Pair(page.width, page.height)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error preloading page $i dimensions", e)
                }
            }
        }
    }
    
    // Get page dimensions on-demand if not already cached
    private suspend fun getPageDimensions(pageIndex: Int): Pair<Int, Int> {
        // Return cached if available
        pageDimensions[pageIndex]?.let { return it }
        
        // Load on-demand
        val renderer = pdfRenderer ?: return Pair(612, 792) // Standard page size fallback
        
        return try {
            renderMutex.withLock {
                // Check again inside lock in case another thread loaded it
                pageDimensions[pageIndex] ?: run {
                    renderer.openPage(pageIndex).use { page ->
                        Pair(page.width, page.height).also {
                            pageDimensions[pageIndex] = it
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading page $pageIndex dimensions", e)
            Pair(612, 792) // Fallback
        }
    }
    
    private fun closePdfRenderer() {
        try {
            pdfRenderer?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing renderer", e)
        }
        pdfRenderer = null
        
        try {
            parcelFileDescriptor?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing file descriptor", e)
        }
        parcelFileDescriptor = null
    }
    
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
    
    private suspend fun downloadOrGetFile(uri: String): File = withContext(Dispatchers.IO) {
        when {
            uri.startsWith("file://") -> File(uri.substring(7))
            uri.startsWith("http://") || uri.startsWith("https://") -> {
                val hash = uri.hashCode().toString()
                val file = File(context.cacheDir, "pdf_$hash.pdf")
                val tempFile = File(context.cacheDir, "pdf_${hash}_temp.pdf")
                
                // Check if cached file exists and is reasonably fresh (< 1 hour)
                if (file.exists() && (System.currentTimeMillis() - file.lastModified() < 3600_000)) {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Using cached PDF file: ${file.absolutePath}")
                    }
                    return@withContext file
                }
                
                // Download with better error handling and progress
                try {
                    val url = URL(uri)
                    val connection = url.openConnection().apply {
                        connectTimeout = 30_000 // 30 seconds
                        readTimeout = 60_000   // 60 seconds
                        setRequestProperty("Accept", "application/pdf")
                        
                        // Add cache headers for better HTTP caching
                        if (file.exists()) {
                            setRequestProperty("If-Modified-Since", 
                                java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", java.util.Locale.US)
                                    .apply { timeZone = java.util.TimeZone.getTimeZone("GMT") }
                                    .format(java.util.Date(file.lastModified())))
                        }
                    }
                    
                    val contentLength = connection.contentLength
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Downloading PDF: $uri, size: $contentLength bytes")
                    }
                    
                    connection.getInputStream().use { input ->
                        FileOutputStream(tempFile).use { output ->
                            val buffer = ByteArray(8192)
                            var bytesRead: Int
                            var totalRead = 0
                            
                            while (input.read(buffer).also { bytesRead = it } != -1) {
                                output.write(buffer, 0, bytesRead)
                                totalRead += bytesRead
                                
                                // Log progress for large files
                                if (BuildConfig.DEBUG && contentLength > 0 && totalRead % (contentLength / 10 + 1) == 0) {
                                    val progress = (totalRead * 100) / contentLength
                                    Log.d(TAG, "Download progress: $progress%")
                                }
                            }
                            
                            output.flush()
                        }
                    }
                    
                    // Move temp file to final location
                    if (tempFile.exists()) {
                        file.delete() // Remove old cached file
                        tempFile.renameTo(file)
                    }
                    
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Download completed: ${file.absolutePath}")
                    }
                } catch (e: Exception) {
                    // Clean up temp file on error
                    tempFile.delete()
                    
                    // If download failed but we have an old cached version, use it
                    if (file.exists()) {
                        Log.w(TAG, "Download failed, using cached version: ${e.message}")
                        return@withContext file
                    }
                    
                    throw e
                }
                
                file
            }
            else -> File(uri)
        }
    }
    
    fun goToPage(page: Int) {
        val renderer = pdfRenderer ?: run {
            emitError("PDF not loaded", "NOT_LOADED")
            return
        }
        if (page !in 0 until renderer.pageCount) {
            emitError("Invalid page: $page. Valid range: 0-${renderer.pageCount - 1}", "INVALID_PAGE")
            return
        }
        
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "goToPage called: $page")
        }
        
        post {
            // Use smoothScrollToPosition for animated scroll
            recyclerView.smoothScrollToPosition(page)
            
            // Emit page change event for UI sync
            emitPageChange(page)
            
            postDelayed({ schedulePreload() }, 100)
        }
    }
    
    fun setScale(scale: Float) {
        if (!enableZoom) {
            emitError("Zoom is disabled", "ZOOM_DISABLED")
            return
        }
        
        val clampedScale = scale.coerceIn(minScale, maxScale)
        if ((clampedScale - currentScale).let { it < 0.01f && it > -0.01f }) return
        
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "setScale: $clampedScale (was $currentScale)")
        }
        currentScale = clampedScale
        
        // Clear cache but DON'T recycle bitmaps (RecyclerView may still be drawing them)
        bitmapCache.evictAll()
        
        // Update adapter to refresh all views
        adapter?.notifyDataSetChanged()
        emitScaleChange(currentScale)
        
        // Force immediate render of visible pages
        post {
            val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
            val firstVisible = layoutManager?.findFirstVisibleItemPosition() ?: 0
            val lastVisible = layoutManager?.findLastVisibleItemPosition() ?: 0
            
            for (i in firstVisible..lastVisible) {
                startPageRender(i)
            }
            
            // Preload adjacent pages after a delay
            postDelayed({ schedulePreload() }, 150)
        }
    }
    
    fun generateThumbnail(page: Int) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "generateThumbnail called for page: $page")
        }
        val renderer = pdfRenderer ?: run {
            emitError("PDF not loaded", "NOT_LOADED")
            return
        }
        if (page !in 0 until renderer.pageCount) {
            emitError("Invalid page: $page. Valid range: 0-${renderer.pageCount - 1}", "INVALID_PAGE")
            return
        }
        
        // Check cache first
        thumbnailCache[page]?.let { cachedUri ->
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Thumbnail for page $page found in cache: $cachedUri")
            }
            emitThumbnailGenerated(page, cachedUri)
            return
        }
        
        // Check if already being generated (thread-safe)
        if (!pendingThumbnails.add(page)) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Thumbnail for page $page already being generated")
            }
            return
        }
        
        componentScope.launch(Dispatchers.IO) {
            try {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Starting thumbnail generation for page $page")
                }
                val thumbnail = renderThumbnail(page)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Thumbnail bitmap created: ${thumbnail.width}x${thumbnail.height}")
                }
                val uri = saveThumbnailToCache(thumbnail, page)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Thumbnail saved to: $uri")
                }
                
                thumbnailCache[page] = uri
                
                withContext(Dispatchers.Main) {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Emitting thumbnail generated event for page $page")
                    }
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
        
        componentScope.launch(Dispatchers.IO) {
            for (i in 0 until renderer.pageCount) {
                // Check cache first
                val cachedUri = thumbnailCache[i]
                if (cachedUri != null) {
                    withContext(Dispatchers.Main) {
                        emitThumbnailGenerated(i, cachedUri)
                    }
                    continue
                }
                
                // Skip if already being generated
                if (!pendingThumbnails.add(i)) {
                    continue
                }
                
                try {
                    val thumbnail = renderThumbnail(i)
                    val uri = saveThumbnailToCache(thumbnail, i)
                    
                    thumbnailCache[i] = uri
                    
                    withContext(Dispatchers.Main) {
                        emitThumbnailGenerated(i, uri)
                    }
                    
                    // Small delay to avoid overwhelming the system
                    kotlinx.coroutines.delay(50)
                } catch (e: Exception) {
                    Log.e(TAG, "Error generating thumbnail for page $i", e)
                    withContext(Dispatchers.Main) {
                        emitError("Thumbnail $i failed: ${e.message}", "THUMBNAIL_ERROR")
                    }
                } finally {
                    pendingThumbnails.remove(i)
                }
            }
        }
    }
    
    private fun schedulePreload() {
        // Use Choreographer to schedule on next frame
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
            val cacheKey = "$i-${currentScale.toString().take(4)}"
            if (bitmapCache.get(cacheKey) == null) {
                startPageRender(i)
            }
        }
    }
    
    private fun startPageRender(pageIndex: Int) {
        synchronized(activeRenderJobs) {
            if (activeRenderJobs.containsKey(pageIndex)) return
            
            val job = componentScope.launch(Dispatchers.IO) {
                try {
                    val bitmap = renderPage(pageIndex)
                    if (bitmap != null) {
                        val cacheKey = "$pageIndex-${currentScale.toString().take(4)}"
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
                    // Calculate base scale to fit page to view width
                    val baseScale = viewWidth.toFloat() / page.width
                    
                    // Dynamic quality scaling: reduce quality at higher zoom levels
                    // This prevents exponential bitmap growth and OOM errors
                    val renderQuality = when {
                        currentScale <= 1.0f -> BASE_RENDER_QUALITY // Normal zoom: 1.5x quality
                        currentScale <= HIGH_ZOOM_THRESHOLD -> 1.2f  // Slight zoom: 1.2x quality
                        currentScale <= 2.0f -> 1.0f                 // Medium zoom: 1.0x quality
                        currentScale <= 3.0f -> 0.85f                // High zoom: 0.85x quality
                        else -> kotlin.math.max(0.7f, 2.5f / currentScale) // Very high zoom: inverse scaling
                    }
                    
                    // Calculate final scale with dynamic quality
                    val totalScale = baseScale * currentScale * renderQuality
                    var bitmapWidth = (page.width * totalScale).toInt().coerceAtLeast(1)
                    var bitmapHeight = (page.height * totalScale).toInt().coerceAtLeast(1)
                    
                    // Enforce maximum bitmap dimensions to prevent GPU texture limits
                    // Most Android devices support 4096x4096, some up to 8192x8192
                    if (bitmapWidth > MAX_BITMAP_DIMENSION || bitmapHeight > MAX_BITMAP_DIMENSION) {
                        val aspectRatio = page.width.toFloat() / page.height.toFloat()
                        if (bitmapWidth > bitmapHeight) {
                            bitmapWidth = MAX_BITMAP_DIMENSION
                            bitmapHeight = (MAX_BITMAP_DIMENSION / aspectRatio).toInt()
                        } else {
                            bitmapHeight = MAX_BITMAP_DIMENSION
                            bitmapWidth = (MAX_BITMAP_DIMENSION * aspectRatio).toInt()
                        }
                        if (BuildConfig.DEBUG) {
                            Log.w(TAG, "Page $pageIndex bitmap capped to ${bitmapWidth}x${bitmapHeight} (scale: $currentScale, quality: $renderQuality)")
                        }
                    }
                    
                    // Calculate approximate memory usage
                    val estimatedMemoryMB = (bitmapWidth * bitmapHeight * 4) / (1024 * 1024)
                    if (estimatedMemoryMB > 50) {
                        if (BuildConfig.DEBUG) {
                            Log.w(TAG, "Page $pageIndex: Large bitmap ${bitmapWidth}x${bitmapHeight} (~${estimatedMemoryMB}MB)")
                        }
                    }
                    
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Rendering page $pageIndex: ${bitmapWidth}x${bitmapHeight} (scale: $currentScale, quality: $renderQuality, totalScale: $totalScale)")
                    }
                    
                    // ARGB_8888 is required for PdfRenderer
                    val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
                    
                    Canvas(bitmap).drawColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    
                    bitmap
                }
            }
        } catch (e: OutOfMemoryError) {
            Log.e(TAG, "OOM rendering page $pageIndex at scale $currentScale", e)
            // Clear cache and try to recover memory
            bitmapCache.evictAll()
            System.gc()
            
            // Emit error to inform user
            withContext(Dispatchers.Main) {
                emitError("Out of memory at zoom level ${currentScale}x. Try reducing zoom.", "OOM_ERROR")
            }
            null
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Invalid bitmap dimensions for page $pageIndex", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error rendering page $pageIndex", e)
            null
        }
    }
    
    private suspend fun renderThumbnail(pageIndex: Int): Bitmap = withContext(Dispatchers.IO) {
        val renderer = pdfRenderer ?: throw IllegalStateException("No renderer")
        
        renderMutex.withLock {
            renderer.openPage(pageIndex).use { page ->
                val thumbSize = 120
                val aspectRatio = page.height.toFloat() / page.width.toFloat()
                val thumbWidth = thumbSize
                val thumbHeight = (thumbSize * aspectRatio).roundToInt()
                
                val bitmap = Bitmap.createBitmap(thumbWidth, thumbHeight, Bitmap.Config.ARGB_8888)
                Canvas(bitmap).drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                
                bitmap
            }
        }
    }
    
    private fun saveThumbnailToCache(bitmap: Bitmap, page: Int): String {
        val cacheDir = File(context.cacheDir, "PDFThumbnails").apply { 
            if (!exists()) mkdirs() 
        }
        
        val hash = getDocumentHash()
        val file = File(cacheDir, "thumb_${page}_$hash.jpg")
        
        FileOutputStream(file).use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
        }
        
        if (!bitmap.isRecycled) bitmap.recycle()
        
        return "file://${file.absolutePath}"
    }
    
    private fun getDocumentHash(): String {
        val uri = sourceUri ?: return "unknown"
        return try {
            MessageDigest.getInstance("MD5")
                .digest(uri.toByteArray())
                .joinToString("") { "%02x".format(it) }
                .substring(0, 8)
        } catch (e: Exception) {
            "unknown"
        }
    }
    
    private fun cleanupThumbnailDirectory() {
        try {
            val cacheDir = File(context.cacheDir, "PDFThumbnails")
            if (cacheDir.exists() && cacheDir.isDirectory) {
                cacheDir.listFiles()?.forEach { file ->
                    try {
                        file.delete()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error deleting thumbnail file: ${file.name}", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning up thumbnail directory", e)
        }
    }
    
    inner class PdfPageAdapter : RecyclerView.Adapter<PdfPageViewHolder>() {
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
            // Set height first
            val dimensions = pageDimensions[position]
            if (dimensions != null && viewWidth > 0) {
                val scale = (viewWidth.toFloat() / dimensions.first) * currentScale
                val targetHeight = (dimensions.second * scale).toInt().coerceAtLeast(100)
                holder.imageView.layoutParams.height = targetHeight
            } else {
                // Dimensions not loaded yet, use default height and trigger lazy load
                holder.imageView.layoutParams.height = (viewWidth * 1.414f).toInt().coerceAtLeast(100)
                
                // Trigger lazy loading of dimensions in background
                componentScope.launch(Dispatchers.IO) {
                    val dims = getPageDimensions(position)
                    withContext(Dispatchers.Main) {
                        // Update the view if it's still showing this position
                        if (holder.bindingAdapterPosition == position) {
                            val scale = (viewWidth.toFloat() / dims.first) * currentScale
                            val targetHeight = (dims.second * scale).toInt().coerceAtLeast(100)
                            holder.imageView.layoutParams.height = targetHeight
                            holder.imageView.requestLayout()
                        }
                    }
                }
            }
            
            // Check cache for valid bitmap at current scale
            val cacheKey = "$position-${currentScale.toString().take(4)}"
            val cached = bitmapCache.get(cacheKey)
            if (cached != null && !cached.isRecycled) {
                holder.imageView.setImageBitmap(cached)
            } else {
                // Show placeholder and trigger render
                holder.imageView.setImageBitmap(createPlaceholderBitmap(position))
                startPageRender(position)
            }
        }
        
        override fun onViewRecycled(holder: PdfPageViewHolder) {
            super.onViewRecycled(holder)
            // Clear reference but don't recycle the bitmap (cache may still have it)
            holder.imageView.setImageBitmap(null)
        }
        
        private fun createPlaceholderBitmap(pageIndex: Int): Bitmap {
            val dimensions = pageDimensions[pageIndex]
            val w = dimensions?.let { (it.first * 0.1f).toInt() } ?: 100
            val h = dimensions?.let { (it.second * 0.1f).toInt() } ?: 100
            
            return Bitmap.createBitmap(w.coerceAtLeast(10), h.coerceAtLeast(10), Bitmap.Config.ARGB_8888).apply {
                Canvas(this).drawColor(Color.WHITE)
            }
        }
    }
    
    inner class PdfPageViewHolder(val imageView: ImageView) : RecyclerView.ViewHolder(imageView)
    
    inner class ScaleListener : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            if (!enableZoom) return false
            
            val newScale = (currentScale * detector.scaleFactor).coerceIn(minScale, maxScale)
            if (newScale != currentScale) {
                setScale(newScale)
            }
            return true
        }
        
        override fun onScaleBegin(detector: ScaleGestureDetector): Boolean = enableZoom
    }
    
    inner class GestureListener : GestureDetector.SimpleOnGestureListener() {
        override fun onDoubleTap(e: MotionEvent): Boolean {
            if (!enableZoom) return false
            
            // Toggle between current scale and 2x zoom (or reset to 1.0 if already zoomed)
            val targetScale = if (currentScale > 1.5f) 1.0f else 2.0f
            setScale(targetScale)
            return true
        }
    }
    
    // Event emitters
    private fun emitLoadComplete(pageCount: Int, pageWidth: Int, pageHeight: Int) {
        // Call Nitro callback
        onLoadCompleteCallback?.invoke(pageCount, pageWidth, pageHeight)
    }
    
    private fun emitPageChange(page: Int) {
        val pageCount = pdfRenderer?.pageCount ?: return
        
        // Call Nitro callback
        onPageChangeCallback?.invoke(page, pageCount)
    }
    
    private fun emitScaleChange(scale: Float) {
        // Call Nitro callback
        onScaleChangeCallback?.invoke(scale)
    }
    
    private fun emitError(message: String, code: String) {
        // Call Nitro callback
        onErrorCallback?.invoke(message, code)
    }
    
    private fun emitThumbnailGenerated(page: Int, uri: String) {
        // Call Nitro callback
        onThumbnailGeneratedCallback?.invoke(page, uri)
    }
    
    private fun emitLoadingChange(loading: Boolean) {
        // Call Nitro callback
        onLoadingChangeCallback?.invoke(loading)
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        
        // Cancel all coroutines
        componentScope.cancel()
        cancelAllRenderJobs()
        
        // Wait for RecyclerView to finish drawing before recycling bitmaps
        post {
            val snapshot = bitmapCache.snapshot()
            bitmapCache.evictAll()
            
            // Now safe to recycle - views are detached
            snapshot.values.forEach { bitmap ->
                if (!bitmap.isRecycled) {
                    try {
                        bitmap.recycle()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error recycling bitmap", e)
                    }
                }
            }
        }
        
        closePdfRenderer()
        pageDimensions.clear()
        thumbnailCache.clear()
        pendingThumbnails.clear()
        
        // Clean up thumbnail directory
        cleanupThumbnailDirectory()
    }
    
    // Extension function for try-with-resources pattern
    private inline fun <T : AutoCloseable, R> T.use(block: (T) -> R): R {
        var exception: Throwable? = null
        try {
            return block(this)
        } catch (e: Throwable) {
            exception = e
            throw e
        } finally {
            when {
                exception == null -> close()
                else -> try {
                    close()
                } catch (closeException: Throwable) {
                    exception.addSuppressed(closeException)
                }
            }
        }
    }
}
