
import app from './server-app.js';
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('✅ App berjalan di http://localhost:'+port));
