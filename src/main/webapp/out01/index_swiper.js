/**
 * jiangyukun on 16/6/19.
 */
+function (window, undefined) {
    'use strict';

    var _ = window._;
    var $ = window.$;

    var $allCategoryContainer = $('.all-category-container');
    var $allProductContainer = $('.all-product-container');

    var _categoryItemTemplateText = _.template($('#categoryItemTemplate').html());
    var _twoProductTemplate = _.template($('#twoProductTemplate').html());
    var _productItemTemplate = _.template($('#productItemTemplate').html());


    var swiper = new Swiper('.swiper-container', {
        pagination: '.swiper-pagination',
        paginationClickable: true
    });

    function fetchCategoryFromServer(showCategoryList) {
        var categoryList = [];
        for (var i = 0; i < 10; i++) {
            var categoryItem = {
                imageUrl: 'images/kk.png',
                text: '分类' + (i + 1),
                link: 'http:baidu.com'
            };
            categoryList.push(categoryItem);
        }

        showCategoryList(categoryList);
    }


    function showCategoryList(categoryList) {
        for (var i = 0; i < categoryList.length; i++) {
            var categoryItem = categoryList[i];
            var categroyItemHtml = _categoryItemTemplateText({
                imageUrl: categoryItem.imageUrl,
                text: categoryItem.text,
                link: categoryItem.link

            });

            $allCategoryContainer.append(categroyItemHtml);
        }
    }

    fetchCategoryFromServer(showCategoryList);




//
    function fetchProductFromServer(showProductList) {
        var productList = [];
        for (var i = 0; i < 5; i++) {
            var productItem = {
                imageUrl: 'images/kk.png',
                text: '分类' + (i + 1),
                link: 'http:baidu.com'
            };
            productList.push(productItem);
        }

        showProductList(productList);
    }


    function showProductList(productList) {
        for (var i = 0; i < productList.length; i += 2) {
            var productItem1 = productList[i];
            var productItem2 = productList[i + 1];

            var content1Html = getProductItemHtml(productItem1);
            var content2Html = getProductItemHtml(productItem2);

            var productItemHtml = _twoProductTemplate({
                content1: content1Html,
                content2: content2Html

            });

            $allProductContainer.append(productItemHtml);
        }
    }

    function getProductItemHtml(productItem) {
        if (!productItem) {
            return;
        }
        return _productItemTemplate({
            imageUrl: productItem.imageUrl,
            text: productItem.text,
            link: productItem.link
        });
    }

    fetchProductFromServer(showProductList);

}(window);