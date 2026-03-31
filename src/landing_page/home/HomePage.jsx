import React from 'react';
import Hero from './Hero';
import Awards from './Awards';
import Stats from './Stats';
import Pricing from './Pricing';
import Education from './Education';

// Reverted to ../ because these are inside the landing_page folder!
import OpenAccount from '../OpenAccount';
import Navbar from '../Navbar';
import Footer from '../Footer';

/*
FONT SIZE : 
main heading : 24
heading : 20
text : 16
*/

function HomePage() {
    return (
        <>
            <Navbar />
            <Hero />
            <Stats />
            <Pricing />
            <Education />
            <OpenAccount />
            <Footer />
        </>
    );
}

export default HomePage;