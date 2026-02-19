"use client";

export default function InfoPage() {
    return (
        <main className=" bg-white">
            <div className="container mx-auto px-4 md:px-6 py-16">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-6">
                    About the Project
                </h1>

                <p className="text-gray-700 leading-relaxed mb-4">
                    This project, developed under the <strong>PPRN collaboration</strong> between{" "}
                    <span className="font-medium">UMPSA</span> and{" "}
                    <span className="font-medium">East Automation and Engineering Sdn. Bhd.</span>,
                    integrates machine learning algorithms to monitor and classify river water quality
                    in accordance with Malaysia’s national standards.
                </p>

                <p className="text-gray-700 leading-relaxed mb-4">
                    It provides an accessible dashboard for data upload, sensor integration, and
                    visualization tools that deliver actionable insights and predictions.
                </p>

                <p className="text-gray-700 leading-relaxed mb-8">
                    The outcomes include improved decision-making for water operators, early detection
                    of pollution, and recommendations for mitigation strategies through AI-driven analysis.
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
