import type { AccentColor } from '$lib/server/db/schema';

export const ACCENT_COLORS: Record<AccentColor, { label: string; hex: string; ink: string }> = {
	amber: { label: 'Amber', hex: '#e5a00d', ink: '#1a1a1a' },
	blue: { label: 'Blue', hex: '#2a78d6', ink: '#ffffff' },
	purple: { label: 'Purple', hex: '#7c3aed', ink: '#ffffff' },
	pink: { label: 'Pink', hex: '#db2777', ink: '#ffffff' },
	red: { label: 'Red', hex: '#dc2626', ink: '#ffffff' },
	green: { label: 'Green', hex: '#16a34a', ink: '#ffffff' },
	teal: { label: 'Teal', hex: '#0d9488', ink: '#ffffff' }
};
