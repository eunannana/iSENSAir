export default function Footer() {
    return (
        <footer className="bg-gray-50 border-t border-gray-200 mt-16">
            <div className="container mx-auto px-4 md:px-6 py-8 text-center text-sm text-gray-600">
                <p className="mb-2">
                    © {new Date().getFullYear()} UMPSA • EAESB • PPRN. All rights reserved.
                </p>
                <p className="mb-2">
                    Contact:{" "}
                    <a
                        href="mailto:kamarul@umpsa.edu.my"
                        className="text-blue-600 hover:underline"
                    >
                        kamarul@umpsa.edu.my
                    </a>
                </p>
                <p className="text-xs text-gray-500 max-w-2xl mx-auto">
                    Disclaimer: The data and visualizations provided by iSENS-Air are for
                    research and monitoring purposes only. Accuracy and reliability of
                    predictions may vary. Users are responsible for interpreting and using
                    the information appropriately.
                </p>
            </div>
        </footer>
    );
}
