import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback utilities for premium feel.
 * All functions are fire-and-forget (no awaiting needed).
 */
export const haptic = {
  /** Light tap — quantity changes, toggle selections */
  light: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  },

  /** Medium tap — button presses, card taps */
  medium: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  },

  /** Heavy tap — destructive actions, confirmations */
  heavy: () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
  },

  /** Success — order placed, payment registered */
  success: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  },

  /** Error — validation failed, action error */
  error: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  },

  /** Warning — delete confirmation, cancel */
  warning: () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
  },

  /** Selection change — picker, segment switch */
  selection: () => {
    try { Haptics.selectionAsync(); } catch {}
  },
};
