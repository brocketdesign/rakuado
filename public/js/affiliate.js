$(document).ready(function() {

    $('#statusForm').on('submit', function(e) {
        e.preventDefault(); // Prevent the default form submission
        const wordpressUrl = $('#wordpressUrl').val();
        if (!wordpressUrl) {
            alert('Please enter a WordPress site URL.');
            return;
        }

        $.ajax({
            url: '/api/affiliate/check-plugin-status', // Adjust this if your endpoint URL is different
            method: 'GET',
            data: { wordpressUrl: wordpressUrl },
            success: function(response) {
                $('#result').removeClass('hidden alert-danger').addClass('alert-success').text(`Status: ${response.status}`);
            },
            error: function(xhr) {
                $('#result').removeClass('hidden alert-success').addClass('alert-danger').text(`Error: ${xhr.responseText || 'Failed to fetch plugin status'}`);
            }
        });
    });

     // Function to fetch all affiliates data
     function fetchAffiliates() {
        $.ajax({
            url: '/api/affiliate/all-affiliate-data',
            method: 'GET',
            success: function(data) {
                populateTable(data);
            },
            error: function(error) {
                console.error('Error fetching affiliates:', error);
                alert('Failed to fetch affiliates data.');
            }
        });
    }

    function fetchAndDisplayAnalytics(affiliates) {
        const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
        const dateObj = new Date(today + ' UTC');
        const formattedDate = dateObj.toISOString().split('T')[0];
        console.log({today,formattedDate})

        affiliates.forEach(affiliate => {
            ['opened', 'interacted'].forEach(action => {
                $.get(`/api/affiliate/fetch-popup-data`, { affiliateId: affiliate._id, action: action, today: formattedDate })
                    .done((data) => {
                        // Update the table cells for daily and monthly data
                        $(`#row-${affiliate._id} .analytics-${action}`).html(`  
                            <div class="h-100 d-flex justify-content-start align-items-center">
                                本日: ${data.daily} | 今月: ${data.monthly}
                            </div>
                        `);
                    })
                    .fail((error) => {
                        console.error(`Failed to fetch analytics for ${action}:`, error);
                        $(`#row-${affiliate._id} .analytics-${action}`).html('Error fetching data');
                    });
            });
        });
    }

    function populateTable(affiliates) {
        const tableBody = $('#affiliateTableBody');
        tableBody.empty(); // Clear existing table rows
    
        let btnClass = "btn-light";
        affiliates.forEach((affiliate, index) => {
            btnClass = index % 2 === 0 ? "btn-light" : "btn-white";
            const row = `
                <tr id="row-${affiliate._id}">
                    <td>${affiliate.name}</td>
                    <td>
                        <a href="${affiliate.wordpressUrl}" target="_blank" class="btn ${btnClass}">
                            <img src="${affiliate.favicon}" width="30px;" class="me-2">
                            ${affiliate.wordpressUrl.replace('https://','').slice(0,10)}
                        </a>
                    </td>
                    <td class="d-none analytics-opened"></td>
                    <td class="analytics-interacted"></td>
                    <td class="text-center">
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" ${affiliate.isActive ? 'checked' : ''} onchange="toggleActivation('${affiliate._id}', this.checked)">
                        </div>
                    </td>
                    <td>
                    <span type="button" class="badge badge-info mx-2" onclick="checkStatus('${affiliate._id}')"><i class="fas fa-bolt"></i></span>
                    <span type="button"  class="badge badge-primary mx-2" onclick="showDetail('${affiliate._id}')"><i class="fas fa-info"></i></span>
                    <a class="badge badge-secondary mx-2" href="/dashboard/app/affiliate/graph/${affiliate._id}" )"><i class="fas fa-chart-line"></i></a>
                    </td>
                    <td>
                        <span type="button"  class="badge badge-danger mx-2" onclick="deleteAffiliate('${affiliate._id}')"><i class="far fa-trash-alt"></i></span>
                    </td>
                </tr>
            `;
            tableBody.append(row);
        });

        fetchAndDisplayAnalytics(affiliates);
    }

    
    window.checkStatus = function(affiliateId) {
        $.ajax({
            url: '/api/affiliate/check-plugin-status?affiliateId=' + affiliateId,
            success: function(response) {
                Swal.fire({
                    title: 'Status:',
                    text: response.status,
                    icon: 'success',
                    confirmButtonText: 'Cool'
                });
            },
            error: function() {
                Swal.fire({
                    title: 'Oops...',
                    text: 'Failed to check status.',
                    icon: 'error',
                    confirmButtonText: 'Got it'
                });
            }
        });
    };
    window.toggleActivation = function(affiliateId, isActive) {
        console.log({isActive})
        $.ajax({
            url: '/api/affiliate/affiliate-data',
            method: 'POST',
            data: JSON.stringify({ affiliateId, updates: { isActive } }),
            contentType: 'application/json',
            success: function(response) {
                Swal.fire({
                    title: 'Success!',
                    text: 'Activation changed',
                    icon: 'success',
                    confirmButtonText: 'Awesome!'
                });
            },
            error: function() {
                Swal.fire({
                    title: 'Oops...',
                    text: 'Failed to change activation.',
                    icon: 'error',
                    confirmButtonText: 'I\'ll try again'
                });
            }
        });
    };
        
      
    // Fetch affiliates on document ready
    fetchAffiliates();
});

function deleteAffiliate(affiliateId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `/api/affiliate/delete-affiliate/${affiliateId}`,
                method: 'DELETE',
                success: function(response) {
                    $(`#row-${affiliateId}`).remove();
                    Swal.fire(
                        'Deleted!',
                        'Affiliate has been deleted.',
                        'success'
                    );
                },
                error: function() {
                    Swal.fire(
                        'Failed!',
                        'Failed to delete affiliate.',
                        'error'
                    );
                }
            });
        }
    });
}

function showDetail(affiliateID) {
    // Start by showing a loading message
    Swal.fire({
        title: 'Loading...',
        text: 'Please wait while we fetch the details.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading(); // Show loading animation

            // Perform the fetch request
            fetch(`/api/affiliate/details/${affiliateID}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json(); // Parse JSON data
                })
                .then(data => {
                    console.log(data); // Log data to console
                    
                    // Display data in modal
                    Swal.fire({
                        html: `
                        <div class="text-center mb-2">
                            <img src="${data.favicon}" width="76px">
                            <h3>パートナーの詳細</h3>
                        </div>
                        <div class="text-start m-4">
                            <strong>ドメイン:</strong> ${data.domain}<br>
                            <strong>アドレス:</strong> ${data.address}<br>
                            <strong>メール:</strong> ${data.email}<br>
                            <strong>名前:</strong> ${data.name}<br>
                            <strong>電話:</strong> ${data.phone}<br>
                            <strong>WordpressのURL:</strong> ${data.wordpressUrl}<br>
                        </div>
                        <div class="accordion" id="bankInfoAccordion">
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="headingOne">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                                        銀行情報
                                    </button>
                                </h2>
                                <div id="collapseOne" class="accordion-collapse collapse text-start" aria-labelledby="headingOne" data-bs-parent="#bankInfoAccordion">
                                    <div class="accordion-body">
                                        <strong>銀行名:</strong> ${data.bank_name}<br>
                                        <strong>支店名:</strong> ${data.bank_branch}<br>
                                        <strong>口座名義:</strong> ${data.bank_account_name}<br>
                                        <strong>口座番号:</strong> ${data.bank_account_number}<br>
                                        <strong>口座種類:</strong> ${data.bank_account_type}
                                    </div>
                                </div>
                            </div>
                        </div>
                        `,
                        icon: false
                    });
                })
                .catch(error => {
                    console.error('Fetch error:', error); // Log error to console

                    // Show error in modal
                    Swal.fire({
                        title: 'Error!',
                        text: 'Failed to fetch details.',
                        icon: 'error',
                        confirmButtonText: 'Close'
                    });
                });
        }
    });
}