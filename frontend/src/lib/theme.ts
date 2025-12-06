'use client';

import { createTheme, MantineColorsTuple } from '@mantine/core';

// Apple-inspired color palette
const appleBlue: MantineColorsTuple = [
  '#e5f3ff',
  '#cde4ff',
  '#9bc6ff',
  '#64a5ff',
  '#3989fe',
  '#1d78fe',
  '#0071ff',
  '#0061e4',
  '#0055cd',
  '#0048b5',
];

const appleGray: MantineColorsTuple = [
  '#f5f5f7',
  '#e8e8ed',
  '#d2d2d7',
  '#86868b',
  '#6e6e73',
  '#515154',
  '#3d3d3f',
  '#2d2d2f',
  '#1d1d1f',
  '#0d0d0d',
];

export const theme = createTheme({
  colors: {
    appleBlue,
    appleGray,
  },
  primaryColor: 'appleBlue',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: '"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '2.5rem', lineHeight: '1.2' },
      h2: { fontSize: '2rem', lineHeight: '1.25' },
      h3: { fontSize: '1.5rem', lineHeight: '1.3' },
      h4: { fontSize: '1.25rem', lineHeight: '1.35' },
      h5: { fontSize: '1rem', lineHeight: '1.4' },
      h6: { fontSize: '0.875rem', lineHeight: '1.45' },
    },
  },
  radius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 500,
          transition: 'all 0.2s ease',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        shadow: 'sm',
      },
      styles: {
        root: {
          transition: 'all 0.2s ease',
        },
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
        shadow: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
      },
    },
    Notification: {
      defaultProps: {
        radius: 'md',
      },
    },
  },
});
