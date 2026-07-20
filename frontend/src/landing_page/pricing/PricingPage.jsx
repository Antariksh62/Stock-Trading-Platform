import React from 'react';
import Hero from './Hero';
import Brokerage from './Brokerage';
import AccountCharges from './AccountCharges';
import ChargesExplained from './ChargesExplained';

function PricingPage() {
    return (
        <div className="font-sans text-gray-800 pb-20">
            <Hero />
            <div className="border-t border-gray-200 my-10"></div>
            <Brokerage />
            <AccountCharges />
            <ChargesExplained />
        </div>
    );
}

export default PricingPage;