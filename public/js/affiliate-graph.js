function updateChart(action, startDate, endDate) {
    $.get(`/api/affiliate/fetch-popup-data-range`, { affiliateId: $('#affiliateId').data('id'), action, startDate, endDate })
        .done((data) => {
            const dataset = myChart.data.datasets.find(d => d.label === action);
            if (dataset) {
                myChart.data.labels = data.map(item => item._id);
                dataset.data = data.map(item => item.count);
                myChart.update();
            } else {
                console.error('Dataset not found for action:', action);
            }
        })
        .fail((error) => {
            console.error(`Failed to fetch analytics for ${action}:`, error);
        });
}


// Graph 
const ctx = document.getElementById('analyticsChart').getContext('2d');
let myChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [], // This will hold the date labels
        datasets: [{
            label: 'opened', // Make sure this label matches exactly with the string in the updateChart function
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1
        }, {
            label: 'interacted', // Make sure this label matches exactly with the string in the updateChart function
            data: [],
            borderColor: 'rgb(153, 102, 255)',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

function showInfo(affiliateID) {
    fetch(`/api/affiliate/details/${affiliateID}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json(); // Parse JSON data
        })
        .then(data => {
            console.log(data); // Log data to console
            
            $('.infos').html(`
            <div class="text-center mb-2">
                <img src="${data.favicon}" width="76px">
                <br>
                <a href="${data.wordpressUrl}" target="_blank">${data.wordpressUrl}</a>
            </div>
            `)
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

$(document).ready(function() {
    const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    const todayDateObj = new Date(today + ' UTC');
    const sevenDaysAgo = new Date(todayDateObj);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const formattedToday = todayDateObj.toISOString().split('T')[0];
    const formattedSevenDaysAgo = sevenDaysAgo.toISOString().split('T')[0];

    // Initial chart update with the dynamic dates
    updateChart('opened', formattedSevenDaysAgo, formattedToday);
    updateChart('interacted', formattedSevenDaysAgo, formattedToday);
    showInfo($('#affiliateId').data('id'))
});

function updateDateRange(range) {
    const today = new Date();
    let startDate, endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (range === 'thisMonth') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First day of this month
    } else if (range === 'lastMonth') {
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1); // First day of last month
        endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of last month
    } else if (range === 'last7Days') {
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7); // 7 days before today
    }

    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];

    // Update chart for both opened and interacted actions
    updateChart('opened', formattedStartDate, formattedEndDate);
    updateChart('interacted', formattedStartDate, formattedEndDate);
}