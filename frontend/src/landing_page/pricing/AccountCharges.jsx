import React from 'react';

function AccountCharges() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-6xl">
            <h3 className="text-2xl font-medium mb-8 text-gray-800">Charges for account opening</h3>
            
            <div className="border border-gray-200 rounded mb-16 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                            <th className="py-4 px-6 font-normal w-2/3">Type of account</th>
                            <th className="py-4 px-6 font-normal">Charges</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700">
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">Individual account</td>
                            <td className="py-4 px-6"><span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">FREE</span></td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">Minor account</td>
                            <td className="py-4 px-6"><span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">FREE</span></td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">NRI account</td>
                            <td className="py-4 px-6">₹ 500</td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">HUF account</td>
                            <td className="py-4 px-6"><span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded mr-2">FREE</span>(online) / ₹ 500 (offline)</td>
                        </tr>
                        <tr>
                            <td className="py-4 px-6">Partnership, LLP, and Corporate accounts (offline only)</td>
                            <td className="py-4 px-6">₹ 500</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h3 className="text-2xl font-medium mb-6 text-gray-800">Demat AMC (Annual Maintenance Charge)</h3>
            <div className="border-l-4 border-blue-600 bg-gray-50 py-3 px-6 mb-8 inline-block">
                Free for first year*
            </div>
            
            <p className="text-sm text-gray-600 mb-6">From second year onwards, for BSDA accounts:</p>
            <div className="border border-gray-200 rounded overflow-hidden mb-6">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                            <th className="py-4 px-6 font-normal w-1/2">Value of holdings</th>
                            <th className="py-4 px-6 font-normal">AMC</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700">
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">Up to ₹4 lakh</td>
                            <td className="py-4 px-6"><span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded">FREE</span></td>
                        </tr>
                        <tr className="border-b border-gray-100">
                            <td className="py-4 px-6">₹4 lakh – ₹10 lakh</td>
                            <td className="py-4 px-6">₹100 per year + 18% GST, charged quarterly</td>
                        </tr>
                        <tr>
                            <td className="py-4 px-6">Above ₹10 lakh</td>
                            <td className="py-4 px-6">₹300 per year + 18% GST, charged quarterly</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-gray-500 mb-2">For a non-BSDA account, AMC is ₹300 per year + 18% GST, regardless of holdings value, charged quarterly.</p>
            <p className="text-xs text-gray-500">*Resident individual accounts only.</p>
        </div>
    );
}

export default AccountCharges;