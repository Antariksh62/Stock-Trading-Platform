import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App';
import HomePage from './landing_page/home/HomePage';
import SignUp from './landing_page/signup/SignUp';
import AboutPage from './landing_page/about/AboutPage.jsx'
import ProductPage from './landing_page/products/ProductPage'
import Pricing from './landing_page/pricing/PricingPage.jsx'
import SupportPage from './landing_page/support/SupportPage.jsx'

import Navbar from './landing_page/Navbar.jsx';
import Footer from './landing_page/Footer.jsx';

import NotFound from './landing_page/NotFound';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>

      <Navbar />

      <div className="max-w-5xl mx-auto px-4 lg:px-8 min-h-screen">        
        <Routes>
        <Route path='/' element={<HomePage />} />
        <Route path='/signup' element={<SignUp />} />
        <Route path='/aboutpage' element={<AboutPage />} />
        <Route path='/productpage' element={<ProductPage />} />
        <Route path='/pricing' element={<Pricing />} />
        <Route path='/supportpage' element={<SupportPage />} />
        <Route path='*' element={<NotFound />} />
      </Routes>
      </div>

      <Footer />

    </BrowserRouter>
  </StrictMode>
);