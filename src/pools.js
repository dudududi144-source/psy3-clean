

// Pre-allocated buffer pool
var BufferPool = {
  buffers: [],
  maxSize: 8,
  get: function(size) {
    for (var i = 0; i < this.buffers.length; i++) {
      if (this.buffers[i].length >= size) {
        return this.buffers[i];
      }
    }
    var buf = new Float32Array(size);
    if (this.buffers.length < this.maxSize) {
      this.buffers.push(buf);
    }
    return buf;
  },
  clear: function() {
    this.buffers = [];
  }
};

// Object pool for voices
var VoicePool = {
  pool: [],
  active: [],
  maxSize: 32,
  get: function() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return {};
  },
  release: function(voice) {
    if (this.pool.length < this.maxSize) {
      this.pool.push(voice);
    }
  },
  clear: function() {
    this.pool = [];
    this.active = [];
  }
};

/* ══════════════════════════════════════════════════════════
   UNDO/REDO SYSTEM (v5.0)
   ══════════════════════════════════════════════════════════ */

var UndoRedo = {
  history: [],
  currentIndex: -1,
  maxSize: 50,
  
  // Push a new state to history
  push: function(state) {
    // Remove any states after current index
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state
    this.history.push(JSON.parse(JSON.stringify(state)));
    this.currentIndex++;
    
    // Limit history size
    if (this.history.length > this.maxSize) {
      this.history.shift();
      this.currentIndex--;
    }
  },
  
  // Undo: go back one state
  undo: function() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  },
  
  // Redo: go forward one state
  redo: function() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  },
  
  // Check if undo is available
  canUndo: function() {
    return this.currentIndex > 0;
  },
  
  // Check if redo is available
  canRedo: function() {
    return this.currentIndex < this.history.length - 1;
  },
  
  // Clear history
  clear: function() {
    this.history = [];
    this.currentIndex = -1;
  }
};

function doUndo() {
  var state = UndoRedo.undo();
  if (state) {
    applyDeviceState(state);
    setStatus('Undo', 'ok');
  }
}

function doRedo() {
  var state = UndoRedo.redo();
  if (state) {
    applyDeviceState(state);
    setStatus('Redo', 'ok');
  }
}