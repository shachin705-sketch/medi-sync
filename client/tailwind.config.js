export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Fraunces', 'serif']
      },
      colors: {
        paper: '#FAF8F4',
        ink: '#14213D',
        teal: '#0B6E6E',
        accent: '#E8590C',
        danger: '#D62839',
        amber: '#E09F1F',
        success: '#2E9E5B',
        gray: '#8A94A6',
        blue: '#2F6FDB'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(20, 33, 61, 0.08)'
      },
      borderRadius: {
        xl: '16px'
      }
    }
  },
  plugins: []
};
