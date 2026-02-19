"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
    { href: "/", label: "Home", external: false },
    { href: "/about", label: "About", external: false },
    {
        href: "https://drive.google.com/file/d/1tz7ZFkPMH3e8SDeo3LtIu0ECkME6ReKT/view?usp=sharing",
        label: "User Manual",
        external: true,
    },
];

export default function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="bg-white border-b border-gray-200">
            <div className="container mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
                {/* brand */}
                <Link href="/" className="font-bold text-gray-800 text-lg">
                    iSENS-Air
                </Link>

                {/* links */}
                <div className="flex gap-6 text-sm font-medium">
                    {links.map((link) => {
                        if (link.external) {
                            // link eksternal → buka tab baru
                            return (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-700 hover:text-blue-600"
                                >
                                    {link.label}
                                </a>
                            );
                        }

                        // link internal → pakai Next Link
                        const isActive =
                            pathname === link.href ||
                            (link.href !== "/" && pathname.startsWith(link.href));

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`${isActive
                                    ? "text-blue-600 font-semibold"
                                    : "text-gray-700"
                                    } hover:text-blue-600`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
