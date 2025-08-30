const mongoose = require('mongoose');

// Organization Schema
const organizationSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  // Visual Assets
  logo: {
    type: String, // URL to uploaded logo image
    default: null
  },
  
  coverPhoto: {
    type: String, // URL to uploaded cover photo
    default: null
  },
  
  // Business Classification
  venueTypes: [{
    type: String,
    enum: ['club', 'restaurant', 'bar', 'theater', 'concert_hall', 'gallery', 'beach_bar', 'lounge', 'cafe', 'hotel', 'festival_ground', 'outdoor_venue', 'other']
  }],
  
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],
  
  // Operating Information
  workingHours: {
    monday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String }, // Format: "HH:MM"
      closeTime: { type: String }  // Format: "HH:MM"
    },
    tuesday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    },
    wednesday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    },
    thursday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    },
    friday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    },
    saturday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    },
    sunday: {
      isOpen: { type: Boolean, default: false },
      openTime: { type: String },
      closeTime: { type: String }
    }
  },
  
  // Description and Content
  description: {
    type: String,
    maxlength: 2000,
    default: ''
  },
  
  // Social Media Links
  socialLinks: {
    website: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Website must be a valid URL'
      }
    },
    facebook: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/(www\.)?facebook\.com\/.+/.test(v);
        },
        message: 'Facebook must be a valid Facebook URL'
      }
    },
    instagram: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/(www\.)?instagram\.com\/.+/.test(v);
        },
        message: 'Instagram must be a valid Instagram URL'
      }
    },
    twitter: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/.test(v);
        },
        message: 'Twitter/X must be a valid Twitter or X URL'
      }
    },
    youtube: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/(www\.)?youtube\.com\/.+/.test(v);
        },
        message: 'YouTube must be a valid YouTube URL'
      }
    }
  },
  
  // Photo Gallery
  gallery: [{
    url: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      maxlength: 200
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Highlights (Stories/Reels)
  highlights: [{
    videoUrl: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Relationships
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  primaryVenue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue',
    default: null
  },
  
  venues: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venue'
  }],
  
  // Reviews and Ratings
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  
  totalReviews: {
    type: Number,
    default: 0
  },
  
  ratingBreakdown: {
    fiveStars: { type: Number, default: 0 },
    fourStars: { type: Number, default: 0 },
    threeStars: { type: Number, default: 0 },
    twoStars: { type: Number, default: 0 },
    oneStar: { type: Number, default: 0 }
  },
  
  // Analytics and Engagement
  followerCount: {
    type: Number,
    default: 0
  },
  
  totalViews: {
    type: Number,
    default: 0
  },
  
  // Campaign Management
  activeCampaigns: [{
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign'
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Status and Visibility
  isPublished: {
    type: Boolean,
    default: false
  },
  
  isArchived: {
    type: Boolean,
    default: false
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Subscription and Features
  subscriptionTier: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    default: 'basic'
  },
  
  enabledFeatures: {
    loyalty: { type: Boolean, default: false },
    reservations: { type: Boolean, default: false },
    inAppOrdering: { type: Boolean, default: false },
    analytics: { type: Boolean, default: true }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
organizationSchema.index({ company: 1 });
organizationSchema.index({ isPublished: 1, isArchived: 1 });
organizationSchema.index({ categories: 1 });
organizationSchema.index({ tags: 1 });
organizationSchema.index({ venueTypes: 1 });
organizationSchema.index({ averageRating: -1 });
organizationSchema.index({ followerCount: -1 });
organizationSchema.index({ createdAt: -1 });

// Text search index
organizationSchema.index({
  name: 'text',
  description: 'text'
});

// Virtual for active highlight
organizationSchema.virtual('activeHighlight').get(function() {
  return this.highlights.find(highlight => highlight.isActive);
});

// Virtual for total events (will be populated via separate query)
organizationSchema.virtual('totalEvents', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'organization',
  count: true
});

// Pre-save middleware to ensure only one active highlight
organizationSchema.pre('save', function(next) {
  if (this.highlights && this.highlights.length > 0) {
    const activeHighlights = this.highlights.filter(h => h.isActive);
    if (activeHighlights.length > 1) {
      // Keep only the first active highlight, deactivate others
      let foundFirst = false;
      this.highlights.forEach(highlight => {
        if (highlight.isActive && foundFirst) {
          highlight.isActive = false;
        } else if (highlight.isActive && !foundFirst) {
          foundFirst = true;
        }
      });
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Method to update rating
organizationSchema.methods.updateRating = function(newRating, oldRating = null) {
  if (oldRating) {
    // Update existing rating
    this.ratingBreakdown[this.getRatingKey(oldRating)]--;
    this.totalReviews--;
  }
  
  this.ratingBreakdown[this.getRatingKey(newRating)]++;
  this.totalReviews++;
  
  // Recalculate average
  const totalPoints = (
    this.ratingBreakdown.fiveStars * 5 +
    this.ratingBreakdown.fourStars * 4 +
    this.ratingBreakdown.threeStars * 3 +
    this.ratingBreakdown.twoStars * 2 +
    this.ratingBreakdown.oneStar * 1
  );
  
  this.averageRating = this.totalReviews > 0 ? (totalPoints / this.totalReviews) : 0;
};

// Helper method for rating keys
organizationSchema.methods.getRatingKey = function(rating) {
  const ratingMap = {
    5: 'fiveStars',
    4: 'fourStars',
    3: 'threeStars',
    2: 'twoStars',
    1: 'oneStar'
  };
  return ratingMap[rating];
};

// Method to check if organization can be deleted
organizationSchema.methods.canBeDeleted = function() {
  // Logic to check if organization has any transactions, events, etc.
  // This would typically involve checking related collections
  return this.totalReviews === 0; // Simplified check
};

// Static method to find published organizations
organizationSchema.statics.findPublished = function() {
  return this.find({ isPublished: true, isArchived: false });
};

// Static method to find by company
organizationSchema.statics.findByCompany = function(companyId) {
  return this.find({ company: companyId, isArchived: false });
};

module.exports = mongoose.model('Organization', organizationSchema);