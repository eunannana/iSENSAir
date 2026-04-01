"use client";

export default function InfoPage() {
    return (
        <main className="bg-white">
            <div className="container mx-auto px-4 md:px-6 py-16">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-6">
                    About the Project
                </h1>

                <p className="text-gray-700 leading-relaxed mb-4">
                    iSENS-AIR is an AI-powered river water quality monitoring system developed under the{" "}
                    <strong>PPRN collaboration</strong> between{" "}
                    <span className="font-medium">Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)</span> and{" "}
                    <span className="font-medium">East Automation and Engineering Sdn. Bhd.</span>
                </p>

                <p className="text-gray-700 leading-relaxed mb-4">
                    The system integrates <strong>IoT-based sensor data</strong>,{" "}
                    <strong>machine learning</strong>, and interactive web technologies to continuously monitor
                    and assess river water conditions. Water quality classification is performed in accordance
                    with Malaysia’s <strong>National Water Quality Standards (NWQS)</strong>, ensuring reliable
                    and standardized evaluation.
                </p>

                <p className="text-gray-700 leading-relaxed mb-4">
                    iSENS-AIR provides a comprehensive dashboard that enables users to:
                </p>

                <ul className="list-disc pl-6 text-gray-700 mb-6 space-y-2">
                    <li>Monitor real-time and historical water quality data</li>
                    <li>Visualize trends through interactive graphs and tables</li>
                    <li>Receive AI-driven classification, interpretation, and confidence levels</li>
                    <li>Identify potential pollution sources and key contributing parameters</li>
                    <li>Obtain actionable recommendations for mitigation and decision-making</li>
                </ul>

                <p className="text-gray-700 leading-relaxed mb-8">
                    By combining data analytics and artificial intelligence, the system supports{" "}
                    <strong>early detection of pollution</strong>, improved environmental monitoring,
                    and informed decision-making for sustainable water resource management.
                </p>

                <h2 className="text-2xl font-bold text-gray-800 mb-4">Contact</h2>
                <p className="text-gray-700">
                    For more information, please contact:{" "}
                    <a
                        href="mailto:kamarul@umpsa.edu.my"
                        className="text-blue-600 hover:underline"
                    >
                        kamarul@umpsa.edu.my
                    </a>
                </p>
            </div>
        </main>
    );
}