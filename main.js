document.addEventListener('DOMContentLoaded', function() {
    const headerContainer = document.getElementById('header-container');
    
    if (headerContainer) {
        fetch('./modules/header.html', {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            cache: 'no-store'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                headerContainer.innerHTML = html;
                initializeHeader();
            })
            .catch(error => {
                console.error('Error loading header:', error);
                headerContainer.innerHTML = `
                    <header>
                        <div class="header-content">
                            <div class="header-left">
                                <a href="/" class="logo">Cantice</a>
                            </div>
                        </div>
                    </header>
                `;
            });
    }
});

function initializeHeader() {
    const hamburger = document.querySelector('.hamburger');
    const mobileNav = document.querySelector('.mobile-nav');

    if (hamburger && mobileNav) {
        hamburger.addEventListener('click', () => {
            mobileNav.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
                mobileNav.classList.remove('active');
            }    
        });
    }
}