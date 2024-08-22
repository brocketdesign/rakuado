$(document).ready(function() {

  // Now you can call these functions anywhere in your script when needed, passing in the relevant data.
  // For example:
  // addUserCategory({ categoryName: "New Category" });

    $('.category-button').on('click',function(){
    mediaID = $(this).closest('.info-container').data('id')
    console.log(`Media id : ${mediaID}`)
    $('#category-list-controller li').each(function(){
        $(this).data('media-id',mediaID)
    })
    
    $('#category-container').toggle().toggleClass('d-flex')
    })
    // jQuery for interactivity
    $('#category-list-controller li').on('click', function() {
        const categoryId = $(this).data('category-id');
        const mediaId = $(this).data('media-id');
        console.log(`Select category : ${categoryId}`)
        console.log(`Select media : ${mediaId}`)
        const data = {
            mediaId,
            categoryId
        };
        addMediasCategory(data);
    });


    //on category Page
    displayCategoryMedias()
});
  // User category functions
  function addUserCategory(data) {
    $.post("/api/user-category/add", data, function(response) {
      // Handle the response, e.g., update the UI or display a message.
      console.log(response);
    });
  }

  function updateUserCategory(data) {
    $.ajax({
      url: "/api/user-category/update",
      type: "PUT",
      data: data,
      success: function(response) {
        // Handle the response
        console.log(response);
      }
    });
  }

  function deleteUserCategory(data) {
    $.ajax({
      url: "/api/user-category/delete",
      type: "DELETE",
      data: data,
      success: function(response) {
        // Handle the response
        console.log(response);
      }
    });
  }

  function getUserCategory(data) {
    $.post("/api/user-category/get", data, function(response) {
      // Handle the response
      console.log(response);
    });
  }

  // Medias category functions
  function addMediasCategory(data) {
    $.post("/api/medias-category/add", data, function(response) {
      // Handle the response, e.g., update the UI or display a message.
      console.log(response);
      handleFormResult(response.success,response.message)
    });
  }

  function deleteMediasCategory(data) {
    $.ajax({
      url: "/api/medias-category/delete",
      type: "DELETE",
      data: data,
      success: function(response) {
        // Handle the response
        console.log(response);
        handleFormResult(response.success,response.message)
      }
    });
  }

  function deleteAllMediasCategories(data) {
    $.ajax({
      url: "/api/medias-category/deleteAll",
      type: "DELETE",
      data: data,
      success: function(response) {
        // Handle the response
        console.log(response);
        handleFormResult(response.success,response.message)
      }
    });
  }
  
  function getMediasCategory(data) {
    $.post("/api/medias-category/get", data, function(response) {
      // Handle the response
      console.log(response);
    });
  }
function displayCategoryMedias(){
        $('#category-list li').on('click', function() {
      const categoryId = $(this).data('category-id');
      console.log(`Select category: ${categoryId}`);
  
      // Use an AJAX request to fetch and display the corresponding elements for the clicked category
      $.get(`/api/medias-category/${categoryId}`, function(data) {
        console.log(data);
        
        // Empty the current display
        $('#medias-list').empty();
  
        // Assuming data is an array of media items
        data.forEach(media => {
          // Create each media item
          const mediaItem = `
            <div class="col-12 col-md-6 mb-3">
              <div class="card info-container px-0 card-clickable-${media.mode}" style="cursor:pointer" data-videoid="${media.video_id}" data-id="${media._id}" data-title="${media.title}">
                <div class="card-body-over position-absolute" style="inset:0;display: none;"></div>
                <div class="card-top py-2 px-3 position-absolute">
                  <div class="d-flex justify-content-between">
                    <button class="delete-button btn btn-dark hover shadow-0" type="button" style="display:none">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
                <img class="card-img-top" type="button" style="object-fit:cover;height: 170px;" src="${media.url || media.imageUrl || media.link}" alt="${media.title}" data-imageurl="${media.imageUrl || ''}" />
                <p class="card-title border-white border p-3">${media.title}</p>
                <div class="card-body py-1 px-3 position-absolute hover" style="top: 0;right:0;display:none">
                  <div class="d-flex flex-column tool-bar py-2">
                    <button class="btn btn-dark category-button btn shadow-0 mb-1" type="button">
                      <i class="fas fa-heart"></i>
                    </button>
                    <a class="btn btn-dark source btn shadow-0 text-white" target="_blank" href="${media.source || media.link || media.webm || media.url}">
                      <i class="fas fa-link"></i>
                    </a>
                  </div>
                </div>
              </div>
              <div class="col-12 col-sm-6 mb-3 summary d-none" data-id="${media._id}" data-videoid="${media.video_id}"></div>
              <div class="col-12 col-sm-6 mb-3 summary-temp d-none" data-id="${media._id}" data-videoid="${media.video_id}"></div>
            </div>
          `;
  
          // Add the media item to the .row container
          $('#medias-list').append(mediaItem);
        });
  
        if (data.length === 0) {
          $('#medias-list').append('<p>ここには何もありません！</p>');
        }
      });
    });
}

  