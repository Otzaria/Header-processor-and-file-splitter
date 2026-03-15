import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from "vite-plugin-singlefile"

// הגדרה ליצירת קובץ HTML אחד ויחיד שרץ בכל מקום
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'esnext', // מומלץ כדי לאפשר פיצ'רים מודרניים של JS בתוך הקובץ
    cssCodeSplit: false,
    assetsInlineLimit: 100000000, // מבטיח שכל הנכסים (תמונות, סקריפטים) ייכנסו לקובץ
    rollupOptions: {
      inlineDynamicImports: true, // קריטי: מוודא שגם ייבוא דינמי לא ייצור קבצים נפרדים
    },
  },
})