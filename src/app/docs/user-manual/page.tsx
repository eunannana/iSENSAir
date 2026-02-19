"use client";

export default function UserManualPage() {
    return (
        <main className=" bg-white">
            <div className="container mx-auto px-4 md:px-6 py-16 text-center">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-6">
                    User Manual
                </h1>

                <p className="text-gray-700 text-lg mb-4">
                    The official user manual is not yet available.
                </p>
                <p className="text-gray-700 text-lg mb-8">
                    <span className="font-semibold">Coming Soon</span> — please check back later for updates.
                </p>

                <div className="inline-block rounded-lg border border-gray-300 bg-gray-50 px-6 py-3 text-gray-600 font-medium shadow-sm">
                    📄 User Manual will be provided here once published.
                </div>
            </div>
        </main>
    );
}
