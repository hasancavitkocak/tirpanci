/** A phone or a tablet (an iPad says it is a Mac, but it has a touch screen). */
export const MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
